import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import ParentLayout from '../../components/parent/ParentLayout';
import { formatCardDate, dDay, reasonText } from '../../utils/parentSchedule';
import { typeOf } from '../../utils/eventFormat';
import { Badge, Button, Callout, Choice, Icon, List, ListRow, Row, Section, Stack } from '../../components/ui';

const SCHEDULE_PATH = '/parent/schedule';

/**
 * 이벤트 상세 + 신청 — 전체 화면 페이지 (`/parent/events/:eventId`).
 * 일정 카드를 누르거나 선생님이 보낸 공유 링크를 열면 여기로 온다.
 *
 * 위에서 아래로: 일시·장소 → (아이 선택) → **옵션 선택과 신청 버튼** → 안내 → 사진 → **신청한 학생 명단**.
 * 옵션을 맨 위에 두는 건 학부모가 여기 오는 이유가 신청이기 때문이고, 명단을 맨 아래 두는 건
 * "누가 같이 가는지" 는 신청을 마친 뒤 궁금한 것이기 때문이다.
 * 신청 가능 여부는 서버가 내려준 판정을 그대로 쓰고, 저장할 때 서버가 한 번 더 확인한다.
 */
function ParentEventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  // loading | ready | missing(비공개·연결 안 된 선생님·지워짐) | error
  const [state, setState] = useState('loading');
  const [childId, setChildId] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async (keepChild) => {
    try {
      const response = await fetchWithAuth(`/api/parent/events/${eventId}`);
      if (!response.ok) {
        setState(response.status === 404 ? 'missing' : 'error');
        return;
      }

      const data = await response.json();
      setEvent(data);
      setState('ready');

      const next = keepChild ?? childId ?? data.children[0]?.childId ?? null;
      setChildId(next);
      const current = data.children.find((c) => c.childId === next);
      setPicked(current?.optionIds || []);
    } catch (error) {
      console.error('이벤트 상세 조회 실패:', error);
      setState('error');
    }
  };

  useEffect(() => {
    setState('loading');
    setEvent(null);
    setMessage('');
    load();
  }, [eventId]);

  const goSchedule = () => navigate(SCHEDULE_PATH);

  if (state === 'loading') {
    return (
      <ParentLayout title="일정" back={SCHEDULE_PATH}>
        <div style={{ textAlign: 'center', color: 'var(--color-gray-500)', padding: '40px 0' }}>불러오는 중...</div>
      </ParentLayout>
    );
  }

  if (state !== 'ready') {
    const missing = state === 'missing';
    return (
      <ParentLayout title="일정" back={SCHEDULE_PATH}>
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '2.5rem' }}>{missing ? '🔗' : '⚠️'}</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '8px' }}>
            {missing ? '이벤트를 찾을 수 없어요' : '이벤트를 불러오지 못했어요'}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', lineHeight: 1.6, marginTop: '6px', wordBreak: 'keep-all' }}>
            {missing
              ? '링크가 잘못됐거나 아직 공개 전이거나, 그 선생님과 연결되지 않은 계정일 수 있어요.'
              : '잠시 후 다시 열어 주세요.'}
          </div>
          <div style={{ marginTop: '14px' }}>
            <Button variant="outline" onClick={goSchedule}>일정으로 가기</Button>
          </div>
        </div>
      </ParentLayout>
    );
  }

  const meta = typeOf(event.type);
  const isClosure = event.type === 'closure';
  const child = event.children.find((c) => c.childId === childId) || null;
  const registered = child && (child.status === 'registered' || child.status === 'confirmed');
  const optionsChanged =
    registered &&
    (picked.length !== child.optionIds.length || picked.some((id) => !child.optionIds.includes(id)));
  const requireMissing = event.requireOption && picked.length === 0;
  const roster = event.registrations || [];

  const selectChild = (id) => {
    setChildId(id);
    const current = event.children.find((c) => c.childId === id);
    setPicked(current?.optionIds || []);
    setMessage('');
  };

  const toggle = (optionId) =>
    setPicked((prev) => (prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]));

  const submit = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetchWithAuth(`/api/parent/events/${event.id}/registrations/${childId}`, {
        method: 'PUT',
        body: JSON.stringify({ optionIds: picked })
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || '신청에 실패했어요.');
        return;
      }

      setMessage(registered ? '옵션을 변경했어요' : '신청했어요 · 선생님에게 전달됩니다');
      await load(childId);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!confirm(`${child.childName} 의 신청을 취소할까요?`)) return;

    setBusy(true);
    setMessage('');
    try {
      const response = await fetchWithAuth(`/api/parent/events/${event.id}/registrations/${childId}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || '취소에 실패했어요.');
        return;
      }

      setMessage(
        data.cancelledAfterConfirm
          ? '취소했어요 · 확정된 신청이라 선생님께 한 번 더 알려 주세요'
          : '신청을 취소했어요'
      );
      await load(childId);
    } finally {
      setBusy(false);
    }
  };

  // 옵션 바로 아래 붙는 신청 버튼. 신청할 수 없으면 버튼 대신 이유(Callout)만 보인다.
  const actions = (() => {
    if (!child) return null;

    if (registered) {
      if (!child.canRegister) return null;
      return (
        <Row gap={2}>
          <Button variant="danger-quiet" block disabled={busy} onClick={cancel}>신청 취소</Button>
          <Button variant="primary" block disabled={busy || !optionsChanged || requireMissing} onClick={submit}>
            옵션 변경
          </Button>
        </Row>
      );
    }

    if (child.canRegister) {
      return (
        <Button variant="primary" block disabled={busy || requireMissing} onClick={submit}>
          {event.options.length > 0 ? '선택한 옵션으로 신청하기' : '참가 신청'}
        </Button>
      );
    }

    return null;
  })();

  return (
    <ParentLayout title={event.title} back={SCHEDULE_PATH}>
      <Stack gap={5}>
        {/* 일시 · 장소 */}
        <Stack gap={2}>
          <Row gap={2} wrap>
            <Badge tone={meta.tone || 'neutral'}>{meta.short}</Badge>
            <span className="ui-text-sm ui-text-subtle">{dDay(event, event.today).text}</span>
          </Row>

          <Stack gap={1}>
            <Row gap={2} className="ui-text-sm">
              <Icon name="calendar" size={16} />
              {formatCardDate(event)}
            </Row>
            {event.location && (
              <Row gap={2} className="ui-text-sm">
                <Icon name="mapPin" size={16} />
                {event.location}
              </Row>
            )}
            {event.registrationDeadline && !isClosure && (
              <Row gap={2} className="ui-text-sm">
                <Icon name="clock" size={16} />
                접수 마감 {event.registrationDeadline.slice(0, 16).replace('T', ' ')}
              </Row>
            )}
          </Stack>
        </Stack>

        {isClosure ? (
          <Callout tone="neutral">휴관일 안내예요. 신청은 필요 없어요.</Callout>
        ) : (
          <Section
            title="신청"
            description={
              event.options.length > 0
                ? (event.requireOption ? '옵션을 1개 이상 골라 신청해요' : '옵션은 선택 사항 · 여러 개 가능')
                : undefined
            }
            data-testid="registration-section"
          >
            <Stack gap={3}>
              {event.children.length > 1 && (
                <Row gap={2} wrap role="group" aria-label="누구를 신청할까요?">
                  {event.children.map((c) => (
                    <button
                      key={c.childId}
                      type="button"
                      className="ui-chip"
                      aria-pressed={c.childId === childId}
                      onClick={() => selectChild(c.childId)}
                    >
                      {c.childName}
                    </button>
                  ))}
                </Row>
              )}

              {event.options.length > 0 && (
                <Stack gap={2} role="group" aria-label="옵션">
                  {event.options.map((option) => {
                    const on = picked.includes(option.id);
                    const disabled = !child?.canRegister && !registered;
                    return (
                      <Choice
                        key={option.id}
                        selected={on}
                        disabled={disabled}
                        onClick={() => toggle(option.id)}
                      >
                        <span className="ui-choice__mark" data-on={on || undefined}>
                          {on && <Icon name="check" size={14} strokeWidth={3} />}
                        </span>
                        {option.label}
                      </Choice>
                    );
                  })}
                </Stack>
              )}

              {registered && (
                <Callout tone="success">
                  {child.childName} 신청 완료
                  {child.status === 'confirmed' && ' · 선생님이 확정했어요'}
                  {picked.length > 0 &&
                    ` · ${event.options.filter((o) => picked.includes(o.id)).map((o) => o.label).join(', ')}`}
                </Callout>
              )}

              {!registered && child && !child.canRegister && (
                <Callout tone="warning">{reasonText(child.reason, child.childName)}</Callout>
              )}

              {!child && (
                <Callout tone="warning">
                  이 선생님께 등록된 아이가 없어요. 내 정보에서 아이를 추가하면 신청할 수 있어요.
                </Callout>
              )}

              {message && <Callout tone="neutral" role="status">{message}</Callout>}

              {actions}
            </Stack>
          </Section>
        )}

        {event.description && (
          <Section title="안내">
            <div
              style={{
                whiteSpace: 'pre-wrap',
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3)',
                color: 'var(--ink-700)'
              }}
            >
              {event.description}
            </div>
          </Section>
        )}

        {event.album?.available && (
          <Section title="사진 · 영상">
            <button
              type="button"
              className="ui-card"
              data-padding="none"
              data-interactive="true"
              onClick={() => navigate(`/parent/photos/${event.id}`)}
            >
              {event.album.previews?.length > 0 && (
                <div className="ui-album-preview">
                  {event.album.previews.slice(0, 4).map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt=""
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                    />
                  ))}
                </div>
              )}
              <Row gap={3} justify="between" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                <div>
                  <div className="ui-list-row__title">앨범 열기</div>
                  <div className="ui-list-row__subtitle">
                    사진 {event.album.counts.images} · 영상 {event.album.counts.videos}
                    {event.album.counts.mine ? ` · 우리 아이 ${event.album.counts.mine}장` : ''}
                  </div>
                </div>
                <Icon name="chevronRight" size={18} />
              </Row>
            </button>
          </Section>
        )}

        {/* 신청한 학생 명단 — 취소한 신청은 서버가 이미 뺐다 */}
        {!isClosure && (
          <Section
            title={`신청한 학생 ${roster.length}명`}
            description={roster.length > 0 ? '이름 가나다순' : undefined}
            data-testid="roster-section"
          >
            {roster.length === 0 ? (
              <div className="ui-text-sm ui-text-subtle">아직 신청한 학생이 없어요. 첫 번째로 신청해 보세요.</div>
            ) : (
              <List aria-label="신청한 학생">
                {roster.map((row, i) => (
                  <ListRow
                    key={`${row.studentName}-${i}`}
                    title={row.studentName}
                    subtitle={row.options.length > 0 ? row.options.join(', ') : undefined}
                    trailing={
                      <Row gap={1} wrap>
                        {row.mine && <Badge tone="brand">우리 아이</Badge>}
                        {row.status === 'confirmed' && <Badge tone="success" dot>확정</Badge>}
                      </Row>
                    }
                  />
                ))}
              </List>
            )}
          </Section>
        )}
      </Stack>
    </ParentLayout>
  );
}

export default ParentEventDetail;
