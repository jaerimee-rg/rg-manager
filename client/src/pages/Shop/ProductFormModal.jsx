import React, { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import {
  TITLE_MAX, formatPriceInput, hostnameOf, normalizeUrl, validateProductForm
} from '../../utils/shopFormat';
import { ACCEPT, isAllowedImageName, resizeForUpload } from '../../utils/imageResize';
import {
  Button, Callout, Field, Icon, Input, InputGroup, Modal, Select, Stack, SwitchField
} from '../../components/ui';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const OPTIONAL = <span className="ui-text-subtle" style={{ fontWeight: 400 }}> 선택</span>;

const previewOf = (file) => {
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
};

const readError = async (response, fallback) => {
  try {
    const data = await response.json();
    return { message: data.error || fallback, fields: data.fields || null };
  } catch {
    return { message: fallback, fields: null };
  }
};

/**
 * 상품 등록·수정 (FR-410~417). 필수는 타이틀뿐이다.
 * 저장 순서: 상품을 먼저 저장 → 고른 사진이 있으면 그 상품에 올린다.
 * 사진만 실패해도 상품은 저장된 채로 닫고 안내한다(FR-414).
 */
function ProductFormModal({ product, categories, storageReady, onClose, onSaved, onManageCategories }) {
  const editing = Boolean(product);
  const [title, setTitle] = useState(product?.title || '');
  const [url, setUrl] = useState(product?.url || '');
  const [price, setPrice] = useState(product?.price != null ? formatPriceInput(String(product.price)) : '');
  const [categoryId, setCategoryId] = useState(
    product?.categoryId != null && categories.some((c) => c.id === product.categoryId) ? String(product.categoryId) : ''
  );
  const [isVisible, setIsVisible] = useState(product ? product.isVisible !== false : true);
  const [image, setImage] = useState({ file: null, preview: product?.imageUrl || null, removed: false });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);

  // 새로 고른 사진의 미리보기 주소는 쓰고 나면 돌려준다
  useEffect(() => () => {
    if (image.file && image.preview) URL.revokeObjectURL?.(image.preview);
  }, [image]);

  const pickFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isAllowedImageName(file.name)) {
      setErrors((e) => ({ ...e, image: 'jpg · png · webp · gif 이미지만 올릴 수 있어요' }));
      return;
    }
    setErrors(({ image: _drop, ...rest }) => rest);
    setImage({ file, preview: previewOf(file), removed: false });
  };

  const removeImage = () => setImage({ file: null, preview: null, removed: true });

  const uploadImage = async (productId) => {
    const resized = await resizeForUpload(image.file);
    if (resized.blob.size > MAX_UPLOAD_BYTES) {
      return { error: '사진이 4MB 를 넘어 올리지 못했어요. 수정에서 더 작은 사진으로 다시 올려 주세요.' };
    }
    const response = await fetchWithAuth(
      `/api/shop/products/${productId}/image?filename=${encodeURIComponent(resized.filename)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': resized.blob.type || 'application/octet-stream' },
        body: resized.blob
      }
    );
    if (!response.ok) {
      const { message } = await readError(response, '');
      return { error: `상품은 저장했지만 사진을 올리지 못했어요${message ? ` — ${message}` : ''}. 수정에서 다시 시도해 주세요.` };
    }
    return { product: (await response.json()).product };
  };

  const submit = async (event) => {
    event?.preventDefault();
    if (saving) return;

    const { value, errors: found } = validateProductForm({ title, url, price });
    if (found) {
      setErrors(found);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const response = await fetchWithAuth(editing ? `/api/shop/products/${product.id}` : '/api/shop/products', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ ...value, categoryId: categoryId ? Number(categoryId) : null, isVisible })
      });
      if (!response.ok) {
        const { message, fields } = await readError(response, '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
        if (fields) setErrors(fields);
        else setFormError(message);
        return;
      }

      let saved = (await response.json()).product;
      let imageError = null;

      if (image.file) {
        const result = await uploadImage(saved.id);
        if (result.product) saved = result.product;
        else imageError = result.error;
      } else if (image.removed && product?.imageUrl) {
        const removed = await fetchWithAuth(`/api/shop/products/${saved.id}/image`, { method: 'DELETE' });
        if (removed.ok) saved = (await removed.json()).product;
        else imageError = '상품은 저장했지만 사진을 빼지 못했어요. 다시 시도해 주세요.';
      }

      onSaved(saved, { created: !editing, imageError });
    } catch (error) {
      console.error('상품 저장 실패:', error);
      setFormError('저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const host = !errors.url && normalizeUrl(url).value ? hostnameOf(url) : '';

  return (
    <Modal
      title={editing ? '상품 수정' : '상품 등록'}
      description={editing
        ? (product.url ? `누적 클릭 ${product.clickCount || 0}` : '링크가 없어 클릭을 세지 않아요')
        : '타이틀만 꼭 입력하면 돼요.'}
      onClose={saving ? undefined : onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>취소</Button>
          <Button variant="primary" onClick={submit} loading={saving}>저장</Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack gap={5}>
          {formError && <Callout tone="danger">{formError}</Callout>}

          <Field
            label="타이틀"
            required
            htmlFor="shop-title"
            error={errors.title}
            counter={{ value: title.trim().length, max: TITLE_MAX }}
          >
            {(props) => (
              <Input
                {...props}
                value={title}
                placeholder="예: 사사키 리본 6m 핑크"
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors(({ title: _t, ...rest }) => rest);
                }}
              />
            )}
          </Field>

          <Field
            label={<>연결할 주소{OPTIONAL}</>}
            htmlFor="shop-url"
            error={errors.url}
            hint={host ? `${host} 으로 연결돼요.` : '쇼핑몰 상품 페이지 주소를 붙여 넣으세요. 비우면 누를 수 없는 카드로 보여요.'}
          >
            {(props) => (
              <Input
                {...props}
                value={url}
                inputMode="url"
                placeholder="https://"
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (errors.url) setErrors(({ url: _u, ...rest }) => rest);
                }}
                onBlur={() => {
                  const result = normalizeUrl(url);
                  if (result.error) setErrors((e) => ({ ...e, url: result.error }));
                }}
              />
            )}
          </Field>

          <Field label={<>이미지{OPTIONAL}</>} error={errors.image}>
            {!storageReady ? (
              <Callout tone="warning">이미지 저장소가 설정되지 않아 지금은 사진을 올릴 수 없어요. 상품은 등록돼요.</Callout>
            ) : image.preview ? (
              <div className="shop-image-field">
                <span className="shop-image-field__preview"><img src={image.preview} alt="상품 사진 미리보기" /></span>
                <Stack gap={2}>
                  <Button size="sm" icon="upload" onClick={() => fileInput.current?.click()}>사진 바꾸기</Button>
                  <Button size="sm" variant="ghost" icon="trash" onClick={removeImage}>사진 빼기</Button>
                </Stack>
              </div>
            ) : (
              <div className="ui-dropzone">
                <Icon name="image" size={24} />
                <div className="ui-dropzone__title">상품 사진을 골라 주세요</div>
                <p className="ui-dropzone__hint">jpg · png · webp · gif, 4MB 이하 — 자동으로 줄여서 올려요</p>
                <Button size="sm" icon="upload" onClick={() => fileInput.current?.click()}>사진 선택</Button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              hidden
              aria-label="상품 사진 파일"
              onChange={pickFile}
            />
          </Field>

          <Field
            label={<>카테고리{OPTIONAL}</>}
            htmlFor="shop-category"
            error={errors.categoryId}
            hint={<>목록은 <button type="button" className="ui-link" onClick={onManageCategories}>설정 › 카테고리</button>에서 바꿔요.</>}
          >
            {(props) => (
              <Select {...props} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">선택 안 함</option>
                {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </Select>
            )}
          </Field>

          <Field label={<>가격{OPTIONAL}</>} htmlFor="shop-price" error={errors.price} hint="비우면 가격을 표시하지 않아요.">
            {(props) => (
              <InputGroup addon="원">
                <Input
                  {...props}
                  value={price}
                  inputMode="numeric"
                  placeholder="0"
                  onChange={(e) => {
                    setPrice(formatPriceInput(e.target.value));
                    if (errors.price) setErrors(({ price: _p, ...rest }) => rest);
                  }}
                />
              </InputGroup>
            )}
          </Field>

          <SwitchField
            label="학부모에게 보이기"
            checked={isVisible}
            onChange={(e) => setIsVisible(e.target.checked)}
            description={isVisible ? '공개 상점에 보여요.' : '공개 상점에서 숨겨지고, 클릭 기록은 남아요.'}
          />

        </Stack>
      </form>
    </Modal>
  );
}

export default ProductFormModal;
