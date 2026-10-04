import React, { useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { moveItem } from '../../utils/reorder';
import { CATEGORY_NAME_MAX, SHOP_TEXT_MAX, SHOP_TITLE_MAX } from '../../utils/shopFormat';
import {
  Button, CardFooter, ConfirmDialog, Field, Grid, IconButton, Input, List, ListRow, Section, Stack,
  SwitchField, Textarea, Card
} from '../../components/ui';

const PARTNERS_NOTICE =
  '이 페이지의 일부 링크는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.';

const errorOf = async (response, fallback) => {
  try {
    const data = await response.json();
    return { message: data.error || fallback, fields: data.fields || null };
  } catch {
    return { message: fallback, fields: null };
  }
};

/** 상점 정보 — 이름 · 소개 · 하단 안내문 · 공개 (FR-402~403) */
function ShopInfoForm({ shop, onSaved, showToast }) {
  const [form, setForm] = useState({
    title: shop.title || '',
    intro: shop.intro || '',
    notice: shop.notice || '',
    isActive: shop.isActive !== false
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.title.trim()) {
      setErrors({ title: '상점 이름을 입력해 주세요' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetchWithAuth('/api/shop', { method: 'PUT', body: JSON.stringify(form) });
      if (!response.ok) {
        const { message, fields } = await errorOf(response, '저장하지 못했어요');
        setErrors(fields || { title: message });
        return;
      }
      setErrors({});
      const { shop: saved } = await response.json();
      onSaved(saved);
      showToast(saved.isActive ? '상점 정보를 저장했어요' : '저장했어요 · 지금은 링크를 열어도 상점이 보이지 않아요');
    } catch (error) {
      console.error('상점 정보 저장 실패:', error);
      showToast('저장하지 못했어요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Stack gap={5}>
        <Field label="상점 이름" required htmlFor="shop-name" error={errors.title} counter={{ value: form.title.trim().length, max: SHOP_TITLE_MAX }}>
          {(props) => <Input {...props} value={form.title} onChange={(e) => set({ title: e.target.value })} />}
        </Field>
        <Field label="소개" htmlFor="shop-intro" error={errors.intro} hint="줄바꿈 그대로 보여요." counter={{ value: form.intro.trim().length, max: SHOP_TEXT_MAX }}>
          {(props) => (
            <Textarea {...props} rows={3} value={form.intro} placeholder="예: 수업에서 실제로 쓰는 용품이에요." onChange={(e) => set({ intro: e.target.value })} />
          )}
        </Field>
        <Field
          label="하단 안내문"
          htmlFor="shop-notice"
          error={errors.notice}
          hint={form.notice ? '공개 상점 맨 아래에 작게 보여요.' : (
            <>제휴 링크(쿠팡 파트너스 등)를 쓴다면 고지 문구를 넣어 주세요.{' '}
              <button type="button" className="ui-link" onClick={() => set({ notice: PARTNERS_NOTICE })}>예시 문구 넣기</button>
            </>
          )}
          counter={{ value: form.notice.trim().length, max: SHOP_TEXT_MAX }}
        >
          {(props) => <Textarea {...props} rows={3} value={form.notice} onChange={(e) => set({ notice: e.target.value })} />}
        </Field>
        <SwitchField
          label="상점 공개"
          checked={form.isActive}
          onChange={(e) => set({ isActive: e.target.checked })}
          description={form.isActive
            ? '링크를 아는 사람은 누구나 로그인 없이 볼 수 있어요.'
            : '끄면 링크를 열어도 "지금은 볼 수 없는 페이지예요" 가 보여요. 상품과 기록은 그대로예요.'}
        />
      </Stack>
      <CardFooter>
        <Button variant="primary" onClick={save} loading={saving}>저장</Button>
      </CardFooter>
    </Card>
  );
}

/** 카테고리 — 순서 · 이름 바꾸기 · 삭제 · 추가 (FR-421~422) */
function CategoryManager({ categories, onChanged, showToast }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const move = async (index, direction) => {
    const next = moveItem(categories, index, index + direction);
    if (next === categories) return;
    const response = await fetchWithAuth('/api/shop/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids: next.map((c) => c.id) })
    });
    if (!response.ok) showToast('순서를 저장하지 못했어요');
    await onChanged();
  };

  const startEdit = (category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditError('');
  };

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) {
      setEditError('카테고리 이름을 입력해 주세요');
      return;
    }
    const response = await fetchWithAuth(`/api/shop/categories/${editingId}`, { method: 'PUT', body: JSON.stringify({ name }) });
    if (!response.ok) {
      setEditError((await errorOf(response, '바꾸지 못했어요')).message);
      return;
    }
    setEditingId(null);
    await onChanged();
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) {
      setAddError('카테고리 이름을 입력해 주세요');
      return;
    }
    const response = await fetchWithAuth('/api/shop/categories', { method: 'POST', body: JSON.stringify({ name }) });
    if (!response.ok) {
      setAddError((await errorOf(response, '추가하지 못했어요')).message);
      return;
    }
    setNewName('');
    setAddError('');
    await onChanged();
    showToast(`‘${name}’ 카테고리를 추가했어요`);
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`/api/shop/categories/${deleting.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { affectedProducts } = await response.json();
      setDeleting(null);
      await onChanged();
      showToast(affectedProducts ? `삭제했어요 · 상품 ${affectedProducts}개가 카테고리 없음이 됐어요` : '카테고리를 삭제했어요');
    } catch (error) {
      console.error('카테고리 삭제 실패:', error);
      showToast('삭제하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {categories.length > 0 && (
        <List>
          {categories.map((category, index) => {
            const order = (
              <div className="shop-order">
                <IconButton icon="chevronUp" size="sm" variant="ghost" label={`${category.name} 위로`} disabled={index === 0} onClick={() => move(index, -1)} />
                <IconButton icon="chevronDown" size="sm" variant="ghost" label={`${category.name} 아래로`} disabled={index === categories.length - 1} onClick={() => move(index, 1)} />
              </div>
            );
            if (editingId === category.id) {
              return (
                <ListRow
                  key={category.id}
                  leading={order}
                  trailing={(
                    <>
                      <Button size="sm" variant="primary" onClick={saveEdit}>저장</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>취소</Button>
                    </>
                  )}
                >
                  <Input
                    value={editName}
                    maxLength={CATEGORY_NAME_MAX}
                    aria-label="카테고리 이름"
                    autoFocus
                    invalid={Boolean(editError)}
                    onChange={(e) => { setEditName(e.target.value); setEditError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                  />
                  {editError && <div className="ui-field__error" role="alert" style={{ marginTop: 4 }}>{editError}</div>}
                </ListRow>
              );
            }
            return (
              <ListRow
                key={category.id}
                leading={order}
                title={category.name}
                subtitle={`상품 ${category.productCount || 0}개`}
                trailing={(
                  <>
                    <IconButton icon="edit" size="sm" label={`${category.name} 이름 바꾸기`} onClick={() => startEdit(category)} />
                    <IconButton icon="trash" size="sm" label={`${category.name} 삭제`} onClick={() => setDeleting(category)} />
                  </>
                )}
              />
            );
          })}
        </List>
      )}

      <div className="shop-link" style={{ marginTop: 'var(--space-2)' }}>
        <Input
          value={newName}
          maxLength={CATEGORY_NAME_MAX}
          placeholder="새 카테고리 이름 (예: 수구, 테이프·보호대)"
          aria-label="새 카테고리 이름"
          invalid={Boolean(addError)}
          onChange={(e) => { setNewName(e.target.value); setAddError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <Button icon="plus" onClick={add}>추가</Button>
      </div>
      {addError && <div className="ui-field__error" role="alert">{addError}</div>}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="카테고리를 삭제할까요?"
        message={deleting ? (
          deleting.productCount
            ? `‘${deleting.name}’ 을 지우면 상품 ${deleting.productCount}개가 ‘카테고리 없음’이 돼요. 상품은 지워지지 않아요.`
            : `‘${deleting.name}’ 카테고리를 지울까요?`
        ) : null}
        confirmLabel="삭제"
        tone="danger"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/** 설정 탭 — 상점 정보 + 카테고리 */
function ShopSettings({ shop, categories, onShopSaved, onCategoriesChanged, showToast }) {
  return (
    <Grid cols={2} style={{ marginTop: 'var(--space-5)', alignItems: 'start' }}>
      <Section title="상점 정보" description="공개 상점 맨 위·맨 아래에 보이는 내용이에요.">
        <ShopInfoForm shop={shop} onSaved={onShopSaved} showToast={showToast} />
      </Section>
      <Section title="카테고리" description="상품 등록 때 고르는 목록이에요. 지우면 그 상품은 ‘카테고리 없음’이 돼요.">
        <div>
          <CategoryManager categories={categories} onChanged={onCategoriesChanged} showToast={showToast} />
        </div>
      </Section>
    </Grid>
  );
}

export default ShopSettings;
