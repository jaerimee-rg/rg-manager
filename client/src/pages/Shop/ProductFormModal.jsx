import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import {
  DESCRIPTION_MAX, TITLE_MAX, formatPriceInput, hostnameOf, normalizeUrl, validateProductForm
} from '../../utils/shopFormat';
import { cropToSquare } from '../../utils/imageCrop';
import { pastedProductImage } from '../../utils/clipboardImage';
import {
  MAX_PRODUCT_IMAGES, appendImageFiles, desiredImageOrder, fromSavedImages, imageAddMessage, planImageSave,
  sameOrder, updateImage
} from '../../utils/productImages';
import {
  Button, Callout, Field, Input, InputGroup, Modal, Select, Stack, SwitchField, Textarea
} from '../../components/ui';
import ProductImagesField from './ProductImagesField';
import ImageCropper from './ImageCropper';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const OPTIONAL = <span className="ui-text-subtle" style={{ fontWeight: 400 }}> 선택</span>;

const readError = async (response, fallback) => {
  try {
    const data = await response.json();
    return { message: data.error || fallback, fields: data.fields || null };
  } catch {
    return { message: fallback, fields: null };
  }
};

/**
 * 상품 등록·수정 (FR-410~417 · 2차 04 문서). 필수는 타이틀뿐이다.
 * 저장 순서: 상품 정보 저장 → 뺀 사진 지우기 → 새 사진을 한 장씩(정사각형으로 잘라) 올리기 → 순서 맞추기.
 * 사진만 실패해도 상품은 저장된 채로 닫고 안내한다(FR-414).
 */
function ProductFormModal({ product, categories, storageReady, onClose, onSaved, onManageCategories }) {
  const editing = Boolean(product);
  const [title, setTitle] = useState(product?.title || '');
  const [description, setDescription] = useState(product?.description || '');
  const [url, setUrl] = useState(product?.url || '');
  const [price, setPrice] = useState(product?.price != null ? formatPriceInput(String(product.price)) : '');
  const [categoryId, setCategoryId] = useState(
    product?.categoryId != null && categories.some((c) => c.id === product.categoryId) ? String(product.categoryId) : ''
  );
  const [isVisible, setIsVisible] = useState(product ? product.isVisible !== false : true);
  const [isReservable, setIsReservable] = useState(product?.isReservable === true);
  const [images, setImages] = useState(() => fromSavedImages(product?.images));
  const [imageNotice, setImageNotice] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState({});
  const [progress, setProgress] = useState(null); // { done, total } — 사진 올리는 중
  const [cropKey, setCropKey] = useState(null);
  const [cropDraft, setCropDraft] = useState(null);
  const savingRef = useRef(false); // 빠른 두 번 누르기 — state 는 다음 그리기 전까지 바뀌지 않는다
  const formRef = useRef(null);
  const cropReturn = useRef(null); // 자르기에서 돌아올 때 폼 스크롤 위치와 포커스

  // 새로 넣은 사진의 미리보기 주소 — 빼거나 창을 닫으면 돌려준다
  const previews = useRef(new Set());
  useEffect(() => () => {
    previews.current.forEach((preview) => URL.revokeObjectURL?.(preview));
  }, []);
  const makePreview = (file) => {
    let preview = null;
    try {
      preview = URL.createObjectURL(file);
    } catch {
      preview = null;
    }
    if (preview) previews.current.add(preview);
    return preview;
  };

  const addFiles = (files) => {
    const result = appendImageFiles(images, files, makePreview);
    setImages(result.items);
    setImageNotice(imageAddMessage(result) || '');
  };

  const removeImage = (key) => {
    const item = images.find((i) => i.key === key);
    if (item?.file && item.url) {
      URL.revokeObjectURL?.(item.url);
      previews.current.delete(item.url);
    }
    setImages(images.filter((i) => i.key !== key));
    setImageNotice('');
  };

  // 창이 열려 있는 동안 어디서 붙여 넣어도 사진 칸 맨 뒤에 붙는다 — 창을 열자마자 ⌘V 해도 된다.
  // 저장 중·자르는 중에는 받지 않는다(올리는 사진과 미리보기가 어긋난다).
  // addFiles 가 지금 목록을 봐야 하므로 그릴 때마다 새로 단다.
  useEffect(() => {
    if (!storageReady || saving || cropKey) return undefined;
    const onPaste = (event) => {
      const file = pastedProductImage(event);
      if (!file) return;
      event.preventDefault();
      addFiles([file]);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  // ── 자르기 ──
  const cropItem = images.find((i) => i.key === cropKey);
  const startCrop = (key) => {
    const item = images.find((i) => i.key === key);
    if (!item?.file) return;
    cropReturn.current = { key, scrollTop: formRef.current?.closest('.ui-overlay__body')?.scrollTop || 0 };
    setCropKey(key);
    setCropDraft(item.crop);
  };
  const finishCrop = (apply) => {
    if (apply && cropKey && cropDraft) setImages((list) => updateImage(list, cropKey, { crop: cropDraft }));
    setCropKey(null);
    setCropDraft(null);
  };

  // 자르기에서 돌아오면 보던 자리(스크롤)와 그 사진의 [자르기] 버튼으로 돌려놓는다
  useLayoutEffect(() => {
    if (cropKey || !cropReturn.current) return;
    const { key, scrollTop } = cropReturn.current;
    cropReturn.current = null;
    const body = formRef.current?.closest('.ui-overlay__body');
    if (body) body.scrollTop = scrollTop;
    formRef.current?.querySelector(`[data-crop-key="${key}"]`)?.focus();
  }, [cropKey]);

  // Esc · ✕ — 자르는 중이면 자르기만 취소하고 폼으로 돌아간다
  const handleClose = () => {
    if (cropKey) finishCrop(false);
    else onClose();
  };

  // ── 저장 ──
  const setStatus = (key, status) => setStatuses((s) => ({ ...s, [key]: status }));

  const uploadOne = async (productId, item) => {
    const prepared = await cropToSquare(item.file, item.crop);
    if (prepared.blob.size > MAX_UPLOAD_BYTES) return { error: true, message: '4MB 를 넘는 사진이 있어요' };
    const response = await fetchWithAuth(
      `/api/shop/products/${productId}/images?filename=${encodeURIComponent(prepared.filename)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': prepared.blob.type || 'application/octet-stream' },
        body: prepared.blob
      }
    );
    if (!response.ok) return { error: true, message: (await readError(response, '')).message };
    return response.json();
  };

  /** 사진 지우기·올리기·순서 — 하나가 실패해도(네트워크 오류 포함) 나머지는 계속한다. 최신 상품과 안내를 돌려준다 */
  const saveImages = async (saved) => {
    let latest = saved;
    const problems = [];
    const plan = planImageSave(product?.images || [], images);

    for (const imageId of plan.deletes) {
      try {
        const response = await fetchWithAuth(`/api/shop/products/${saved.id}/images/${imageId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        latest = (await response.json()).product;
      } catch (error) {
        console.error('사진 빼기 실패:', error);
        problems.push('사진을 빼지 못했어요');
      }
    }

    const uploaded = new Map();
    let failed = 0;
    let lastMessage = '';
    setStatuses(Object.fromEntries(plan.uploads.map((item) => [item.key, 'waiting'])));
    for (let i = 0; i < plan.uploads.length; i += 1) {
      const item = plan.uploads[i];
      setProgress({ done: i, total: plan.uploads.length });
      setStatus(item.key, 'uploading');
      let result;
      try {
        result = await uploadOne(saved.id, item);
      } catch (error) {
        console.error('사진 올리기 실패:', error);
        result = { error: true };
      }
      if (result.error) {
        failed += 1;
        lastMessage = result.message || lastMessage;
        setStatus(item.key, 'error');
      } else {
        uploaded.set(item.key, result.image.id);
        latest = result.product;
        setStatus(item.key, 'done');
      }
    }
    if (failed) {
      problems.unshift(`사진 ${failed}장을 올리지 못했어요${lastMessage ? ` — ${lastMessage}` : ''}`);
    }

    // 서버는 새 사진을 맨 뒤에 붙인다 — 선생님이 정한 순서와 다르면 맞춘다.
    // 서버에 남은 사진(빼기 실패 등)은 맨 뒤에 붙여 보낸다 — 하나라도 빠지면 순서 저장이 통째로 거절된다
    const current = (latest.images || []).map((image) => image.id);
    const wanted = desiredImageOrder(images, uploaded).filter((id) => current.includes(id));
    const order = [...wanted, ...current.filter((id) => !wanted.includes(id))];
    if (order.length && !sameOrder(order, current)) {
      try {
        const response = await fetchWithAuth(`/api/shop/products/${saved.id}/images/order`, {
          method: 'PUT',
          body: JSON.stringify({ ids: order })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        latest = (await response.json()).product;
      } catch (error) {
        console.error('사진 순서 저장 실패:', error);
        problems.push('사진 순서를 저장하지 못했어요');
      }
    }

    return {
      product: latest,
      imageError: problems.length ? `상품은 저장했지만 ${problems[0]}. 수정에서 다시 시도해 주세요.` : null
    };
  };

  const submit = async (event) => {
    event?.preventDefault();
    if (savingRef.current) return;

    const { value, errors: found } = validateProductForm({ title, description, url, price });
    if (found) {
      setErrors(found);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError('');
    try {
      const response = await fetchWithAuth(editing ? `/api/shop/products/${product.id}` : '/api/shop/products', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ ...value, categoryId: categoryId ? Number(categoryId) : null, isVisible, isReservable })
      });
      if (!response.ok) {
        const { message, fields } = await readError(response, '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
        if (fields) setErrors(fields);
        else setFormError(message);
        return;
      }

      const saved = (await response.json()).product;
      // 여기부터는 상품이 이미 저장됐다 — 사진 단계에서 무엇이 터져도 창을 닫고 알린다.
      // 열어 둔 채 다시 [저장]을 누르면 등록이 한 번 더 되어 상품이 둘이 된다.
      let result;
      try {
        result = await saveImages(saved);
      } catch (error) {
        console.error('사진 저장 실패:', error);
        result = { product: saved, imageError: '상품은 저장했지만 사진을 저장하지 못했어요. 수정에서 다시 시도해 주세요.' };
      }
      onSaved(result.product, { created: !editing, imageError: result.imageError });
    } catch (error) {
      console.error('상품 저장 실패:', error);
      setFormError('저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
    } finally {
      savingRef.current = false;
      setSaving(false);
      setProgress(null);
    }
  };

  const clearError = (field) => {
    if (errors[field]) setErrors(({ [field]: _drop, ...rest }) => rest);
  };

  const host = !errors.url && normalizeUrl(url).value ? hostnameOf(url) : '';
  const saveLabel = progress ? `사진 올리는 중 ${progress.done + 1}/${progress.total}` : '저장';
  const showImageHelp = storageReady && images.length > 0;

  // 자르기는 같은 창에서 화면만 바꾼다 — 창 위에 창을 띄우면 Esc 한 번에 둘 다 닫힌다
  if (cropItem) {
    return (
      <Modal
        title="사진 자르기"
        description="끌어서 보일 부분을 고르고, 막대로 확대해요. 상점에는 이 정사각형 그대로 보여요."
        onClose={handleClose}
        footer={
          <>
            <Button onClick={() => finishCrop(false)}>취소</Button>
            <Button variant="primary" onClick={() => finishCrop(true)}>적용</Button>
          </>
        }
      >
        <ImageCropper src={cropItem.url} crop={cropDraft || cropItem.crop} onChange={setCropDraft} />
      </Modal>
    );
  }

  return (
    <Modal
      title={editing ? '상품 수정' : '상품 등록'}
      description={editing
        ? (product.url ? `누적 클릭 ${product.clickCount || 0}` : '링크가 없어 클릭을 세지 않아요')
        : '타이틀만 꼭 입력하면 돼요.'}
      onClose={saving ? undefined : handleClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>취소</Button>
          <Button variant="primary" onClick={submit} loading={saving}>{saveLabel}</Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} noValidate>
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
                  clearError('title');
                }}
              />
            )}
          </Field>

          <Field
            label={<>상세 설명{OPTIONAL}</>}
            htmlFor="shop-description"
            error={errors.description}
            hint="상품 제목 바로 아래에 보여요. 줄을 바꾸면 그대로 보여요."
            counter={{ value: description.trim().length, max: DESCRIPTION_MAX }}
          >
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                value={description}
                placeholder="예: 사이즈·색상, 이 상품을 추천하는 이유"
                onChange={(e) => {
                  setDescription(e.target.value);
                  clearError('description');
                }}
              />
            )}
          </Field>

          <Field
            label={<>연결할 주소{OPTIONAL}</>}
            htmlFor="shop-url"
            error={errors.url}
            hint={host ? `${host} 으로 연결돼요.` : '쇼핑몰 상품 페이지 주소를 붙여 넣으세요. 비우면 쇼핑몰 버튼 없이 보여요.'}
          >
            {(props) => (
              <Input
                {...props}
                value={url}
                inputMode="url"
                placeholder="https://"
                onChange={(e) => {
                  setUrl(e.target.value);
                  clearError('url');
                }}
                onBlur={() => {
                  const result = normalizeUrl(url);
                  if (result.error) setErrors((e) => ({ ...e, url: result.error }));
                }}
              />
            )}
          </Field>

          <Field
            label={<>이미지<span className="ui-text-subtle" style={{ fontWeight: 400 }}> 선택 · 최대 {MAX_PRODUCT_IMAGES}장</span></>}
            error={imageNotice || undefined}
            hint={showImageHelp ? (
              <>
                첫 번째 사진이 <b>대표 사진</b>이에요 — 상점 목록 카드에 보여요. ‹ › 로 순서를, [자르기]로 보일 부분을 바꿔요.
                <span className="shop-paste-hint"> 끌어서 옮기거나, 복사한 사진을 붙여 넣어도 돼요 (⌘V · Ctrl+V).</span>
              </>
            ) : undefined}
            counter={showImageHelp ? { value: images.length, max: MAX_PRODUCT_IMAGES } : undefined}
          >
            {!storageReady ? (
              <Callout tone="warning">이미지 저장소가 설정되지 않아 지금은 사진을 올릴 수 없어요. 상품은 등록돼요.</Callout>
            ) : (
              <ProductImagesField
                items={images}
                onChange={(next) => {
                  setImages(next);
                  setImageNotice('');
                }}
                onAddFiles={addFiles}
                onRemove={removeImage}
                onCrop={startCrop}
                statuses={statuses}
                busy={saving}
              />
            )}
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
                    clearError('price');
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

          <SwitchField
            label="예약 받기"
            checked={isReservable}
            onChange={(e) => setIsReservable(e.target.checked)}
            description={isReservable
              ? '상품 상세에 [예약하기] 버튼이 생겨요. 학부모가 이름·전화번호·날짜를 남기면 예약 탭에 들어와요.'
              : '켜면 학부모가 공개 상점에서 이 상품을 예약할 수 있어요.'}
          />

        </Stack>
      </form>
    </Modal>
  );
}

export default ProductFormModal;
