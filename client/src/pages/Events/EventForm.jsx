import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { EVENT_TYPES, splitDeadline, joinDeadline } from '../../utils/eventFormat';
import { getKakaoMapKey, hasCoordinates, locateAddress } from '../../utils/kakaoMap';
import { notifyResultMessage } from '../../utils/pushNotifications';
import OptionsEditor from './OptionsEditor';
import AddressSearchDialog from '../../components/common/AddressSearchDialog';
import MapPickerDialog from '../../components/common/MapPickerDialog';
import PlaceMap from '../../components/common/PlaceMap';
import {
  Button, Callout, Card, Checkbox, ClearableInput, Container, Field, Icon, Input, PageHeader, Row, Spinner, SwitchField, Textarea
} from '../../components/ui';

const TYPE_HINTS = {
  competition: '신청 → 확정 → 참가 학생',
  special: '러닝·특강·발표회',
  closure: '신청 없음 · 안내만'
};

// 주소를 골랐는데 지도에 못 올렸을 때의 안내. 어느 경우든 주소는 저장된다.
const MAP_NOTES = {
  no_key: '지도 키가 아직 설정되지 않아 지도는 보이지 않아요. 주소는 저장되고, 학부모에게는 카카오맵 링크로 보여요.',
  not_found: '이 주소를 지도에서 찾지 못했어요. [지도에서 고르기] 로 직접 고를 수 있고, 그대로 두면 학부모에게는 카카오맵 링크로 보여요.',
  error: '지도를 불러오지 못했어요. 주소는 그대로 저장돼요.'
};

const toCoordinate = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

// 장소 이름을 아직 비워 뒀으면 건물명(없으면 주소)으로 채운다 — 그대로 고쳐 쓸 수 있다
const fillLocation = (location, { address, placeName }) => (location.trim() ? location : (placeName || address));

const emptyForm = {
  type: 'competition',
  title: '',
  date: '',
  endDate: '',
  startTime: '',
  location: '',
  address: '',
  latitude: null,
  longitude: null,
  description: '',
  requireOption: false,
  isPublished: true,
  registrationOpen: true,
  deadlineDate: '',
  deadlineTime: ''
};

/** 종류 3개는 어느 폭에서도 한 줄에 나란히 선다 — 개수가 고정이라 비교가 쉬운 편이 낫다. */
function TypePicker({ value, onChange, locked }) {
  return (
    <div className="event-form__field">
      <span className="ui-field__label" id="ev-type-label">
        종류<span className="ui-field__required" aria-hidden="true">*</span>
        {locked && <span className="event-form__note">등록 후에는 바꿀 수 없어요</span>}
      </span>
      <div className="event-form__types" role="group" aria-labelledby="ev-type-label">
        {Object.entries(EVENT_TYPES).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            className="event-form__type"
            disabled={locked}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            <span className="event-form__type-emoji" aria-hidden="true">{meta.emoji}</span>
            <span className="event-form__type-name">{meta.label}</span>
            <span className="event-form__type-hint">{TYPE_HINTS[key]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EventForm({ basePath = '/events' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const editing = location.state?.event || null;

  const [form, setForm] = useState(emptyForm);
  const [options, setOptions] = useState([]);
  const [usageById, setUsageById] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapNote, setMapNote] = useState(null);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  // 지도 키가 있어야 [지도에서 고르기] 를 보여 준다 — 키 없는 서버에서 열리지 않는 창을 내밀지 않게
  const [mapAvailable, setMapAvailable] = useState(false);
  // 저장할 때 학부모 브라우저 알림을 보낼지. 새 이벤트는 켜 두고, 수정은 꺼 둔다 — 고칠 때마다 다시 알리지 않게.
  const [notifyParents, setNotifyParents] = useState(!editing);
  // 주소를 연달아 바꾸면 늦게 도착한 좌표가 새 주소를 덮지 않도록 요청마다 번호를 붙인다
  const locateSeq = useRef(0);

  /** 주소 → 좌표를 찾아 폼에 넣는다. 못 찾으면 이유만 남기고 주소는 그대로 둔다. */
  const locate = async (address) => {
    const seq = ++locateSeq.current;
    setMapNote(null);
    setLocating(true);

    const found = await locateAddress(address);
    if (seq !== locateSeq.current) return;

    setLocating(false);
    if (found.ok) {
      setForm((prev) => (prev.address === address
        ? { ...prev, latitude: found.latitude, longitude: found.longitude }
        : prev));
    } else {
      setMapNote(found.reason);
    }
  };

  useEffect(() => {
    let alive = true;
    getKakaoMapKey().then((key) => {
      if (alive) setMapAvailable(Boolean(key));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!editing) return;

    const deadline = splitDeadline(editing.registrationDeadline);
    setForm({
      type: editing.type,
      title: editing.title || '',
      date: editing.date || '',
      endDate: editing.endDate || '',
      startTime: editing.startTime || '',
      location: editing.location || '',
      address: editing.address || '',
      latitude: editing.address ? toCoordinate(editing.latitude) : null,
      longitude: editing.address ? toCoordinate(editing.longitude) : null,
      description: editing.description || '',
      requireOption: editing.requireOption === true,
      isPublished: editing.isPublished !== false,
      registrationOpen: editing.registrationOpen !== false,
      deadlineDate: deadline.date,
      deadlineTime: deadline.time
    });
    setOptions(editing.options || []);

    // 키가 없을 때 저장해 좌표가 빠진 주소는 다시 열 때 한 번 더 찾아 본다
    if (editing.type !== 'closure' && editing.address && !hasCoordinates({
      latitude: toCoordinate(editing.latitude), longitude: toCoordinate(editing.longitude)
    })) {
      locate(editing.address);
    }

    // 옵션을 지울 때 "n건의 신청이 선택했습니다" 를 보여주기 위해 사용 수를 받아둔다.
    if (editing.type !== 'closure') {
      fetchWithAuth(`/api/events/${editing.id}/registrations`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          const map = {};
          for (const s of data.summary || []) map[s.id] = s.count;
          setUsageById(map);
        })
        .catch(() => {});
    }
  }, [editing]);

  const isClosure = form.type === 'closure';
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const pickAddress = ({ address, placeName }) => {
    setSearchOpen(false);
    if (!address) return;

    setForm((prev) => ({
      ...prev,
      address,
      latitude: null,
      longitude: null,
      location: fillLocation(prev.location, { address, placeName })
    }));
    locate(address);
  };

  /** 지도에서 고른 자리 — 주소와 좌표가 함께 온다. 주소로 다시 찾지 않는다(찾으면 건물 가운데로 핀이 돌아간다). */
  const pickOnMap = ({ address, placeName, latitude, longitude }) => {
    setMapPickerOpen(false);
    if (!address || !hasCoordinates({ latitude, longitude })) return;

    locateSeq.current += 1;
    setLocating(false);
    setMapNote(null);
    setForm((prev) => ({
      ...prev,
      address,
      latitude,
      longitude,
      location: fillLocation(prev.location, { address, placeName })
    }));
  };

  const clearAddress = () => {
    locateSeq.current += 1;
    setLocating(false);
    setMapNote(null);
    set({ address: '', latitude: null, longitude: null });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (locating) return;

    if (!form.title.trim()) return setError('이벤트 이름을 입력해주세요.');
    if (!form.date) return setError('날짜를 선택해주세요.');
    if (!isClosure && !form.location.trim()) return setError('장소를 입력해주세요.');
    if (form.endDate && form.endDate < form.date) return setError('종료일은 시작일보다 빠를 수 없습니다.');
    if (!isClosure && form.deadlineTime && !form.deadlineDate) {
      return setError('접수 마감 날짜를 선택해주세요.');
    }
    if (!isClosure && form.requireOption && options.length === 0) {
      return setError('옵션을 1개 이상 등록하거나 "옵션 1개 이상 필수" 를 꺼주세요.');
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        location: isClosure ? null : form.location.trim(),
        // 주소·좌표는 주소 검색으로 고른 경우에만. 휴관일은 장소가 없으니 함께 비운다.
        address: isClosure ? null : (form.address || null),
        latitude: isClosure || !form.address ? null : form.latitude,
        longitude: isClosure || !form.address ? null : form.longitude,
        description: form.description.trim(),
        endDate: form.endDate || null,
        startTime: isClosure ? null : (form.startTime || null),
        registrationDeadline: joinDeadline(form.deadlineDate, form.deadlineTime),
        options: options.map((o) => (o.id ? { id: o.id, label: o.label } : o.label)),
        // 비공개 이벤트는 학부모에게 보이지 않으니 알림도 보내지 않는다
        notifyParents: notifyParents && form.isPublished
      };

      const response = await fetchWithAuth(
        editing ? `/api/events/${editing.id}` : '/api/events',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || '저장에 실패했습니다.');
        return;
      }

      if (data.removedOptionRegistrations > 0) {
        alert(`옵션을 지웠습니다. ${data.removedOptionRegistrations}건의 신청에는 "(삭제된 옵션)" 으로 표시됩니다.`);
      }

      // 알림 결과는 이벤트 목록에서 잠깐 보여 준다 ("학부모 3명에게 알림을 보냈어요")
      const toast = notifyResultMessage(data.notification);
      if (toast) navigate(basePath, { state: { toast } });
      else navigate(basePath);
    } catch (err) {
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container>
      <PageHeader
        title={editing ? '이벤트 수정' : '이벤트 등록'}
        onBack={() => navigate(basePath)}
        backLabel="이벤트 관리"
      />

      {/* 데스크탑에서는 "무엇을 하는 일정인가"(본문)와 "누구에게 언제까지 보여줄
          것인가"(공개·접수)가 나란히 서고, 좁아지면 그대로 한 줄로 쌓인다. */}
      <form onSubmit={submit} className="event-form__grid">
        <div className="event-form__main">
          <Card padding="lg">
            <div className="event-form__section">
              <TypePicker value={form.type} onChange={(type) => set({ type })} locked={!!editing} />

              <Field label="이벤트 이름" required htmlFor="ev-title">
                {(props) => (
                  <Input
                    {...props} type="text" value={form.title} maxLength={100}
                    onChange={(e) => set({ title: e.target.value })}
                    placeholder="예: 2026 서울시 리듬체조 대회"
                  />
                )}
              </Field>

              <div className="event-form__pair">
                <Field label="날짜" required htmlFor="ev-date">
                  {(props) => (
                    <Input {...props} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
                  )}
                </Field>
                <Field label="종료일" hint="기간일 때만 채웁니다" htmlFor="ev-end">
                  {(props) => (
                    <ClearableInput
                      {...props} type="date" value={form.endDate}
                      onChange={(e) => set({ endDate: e.target.value })}
                      onClear={() => set({ endDate: '' })}
                      clearLabel="종료일 지우기"
                    />
                  )}
                </Field>
              </div>

              {/* 휴관일은 하루(또는 며칠) 통째로 쉬는 날이라 시간·장소가 없다 — 날짜만 받는다. */}
              {!isClosure && (
                <div className="event-form__pair">
                  <Field label="시간" hint="비우면 종일" htmlFor="ev-time">
                    {(props) => (
                      <ClearableInput
                        {...props} type="time" value={form.startTime}
                        onChange={(e) => set({ startTime: e.target.value })}
                        onClear={() => set({ startTime: '' })}
                        clearLabel="시간 지우기"
                      />
                    )}
                  </Field>
                  <Field label="장소" required htmlFor="ev-loc">
                    {(props) => (
                      <Input
                        {...props} type="text" value={form.location}
                        onChange={(e) => set({ location: e.target.value })}
                        placeholder="예: 올림픽공원 체조경기장"
                      />
                    )}
                  </Field>
                </div>
              )}

              {/* 주소는 선택이다. 고르면 아래에 지도가 떠서 맞는 곳인지 바로 확인하고,
                  학부모 일정 상세에도 같은 지도가 보인다. 핀이 어긋나면 [지도에서 고르기] 로 옮긴다. */}
              {!isClosure && (
                <div className="event-form__field">
                  <span className="ui-field__label" id="ev-address-label">
                    주소
                    <span className="event-form__note">고르면 학부모 일정에 지도가 보여요</span>
                  </span>
                  <div className="event-form__place" role="group" aria-labelledby="ev-address-label">
                    {form.address && (
                      <div className="event-form__address">
                        <Icon name="mapPin" size={18} />
                        <span data-testid="event-address">{form.address}</span>
                      </div>
                    )}

                    <Row gap={2} wrap>
                      <Button icon="search" onClick={() => setSearchOpen(true)}>
                        {form.address ? '주소 변경' : '주소 검색'}
                      </Button>
                      {mapAvailable && (
                        <Button icon="mapPin" onClick={() => setMapPickerOpen(true)} disabled={locating}>
                          지도에서 고르기
                        </Button>
                      )}
                      {form.address && (
                        <Button variant="ghost" icon="x" onClick={clearAddress}>주소 지우기</Button>
                      )}
                    </Row>

                    {locating && <Spinner inline label="지도에서 위치를 찾는 중" />}

                    {form.address && hasCoordinates(form) && (
                      <PlaceMap
                        latitude={form.latitude}
                        longitude={form.longitude}
                        name={form.location}
                        fallback={<p className="ui-field__hint event-form__map-note">{MAP_NOTES.error}</p>}
                      />
                    )}

                    {mapNote && !locating && (
                      <p className="ui-field__hint event-form__map-note" role="status">{MAP_NOTES[mapNote]}</p>
                    )}
                  </div>
                </div>
              )}

              <Field label="학부모 안내" hint="학부모 일정 상세에 그대로 보입니다" htmlFor="ev-desc">
                {(props) => (
                  <Textarea
                    {...props} value={form.description} rows={4} maxLength={1000}
                    onChange={(e) => set({ description: e.target.value })}
                  />
                )}
              </Field>

              {!isClosure && (
                <>
                  <div className="event-form__field">
                    <span className="ui-field__label" id="ev-options-label">
                      옵션
                      <span className="event-form__note">학부모가 신청할 때 체크합니다 · 여러 개 선택 가능</span>
                    </span>
                    <div role="group" aria-labelledby="ev-options-label">
                      <OptionsEditor
                        options={options}
                        onChange={setOptions}
                        usageById={usageById}
                        showApparatus={form.type === 'competition'}
                      />
                    </div>
                  </div>

                  <SwitchField
                    id="ev-require"
                    checked={form.requireOption}
                    onChange={(e) => set({ requireOption: e.target.checked })}
                    label="옵션 1개 이상 필수"
                    description="켜면 학부모가 옵션을 고르지 않고는 신청할 수 없어요"
                  />
                </>
              )}
            </div>
          </Card>
        </div>

        <aside className="event-form__side">
          <Card padding="lg">
            <div className="event-form__section">
              <h2 className="event-form__side-title">공개 · 접수</h2>

              <SwitchField
                id="ev-published"
                checked={form.isPublished}
                onChange={(e) => set({ isPublished: e.target.checked })}
                label="학부모에게 공개"
                description="끄면 학부모 일정에 보이지 않아요 (준비 중인 이벤트)"
              />

              <div className="event-form__field">
                <Checkbox
                  id="ev-notify"
                  label="학부모에게 알림 보내기"
                  checked={notifyParents && form.isPublished}
                  disabled={!form.isPublished}
                  onChange={(e) => setNotifyParents(e.target.checked)}
                />
                <p className="ui-field__hint event-form__notify-hint">
                  {!form.isPublished
                    ? '공개해야 알림을 보낼 수 있어요'
                    : editing
                      ? '체크하고 저장하면 이 일정을 학부모에게 다시 알려요'
                      : '저장하면 알림을 켠 학부모의 휴대폰·PC로 바로 알려요'}
                </p>
              </div>

              {!isClosure && (
                <>
                  <SwitchField
                    id="ev-open"
                    checked={form.registrationOpen}
                    onChange={(e) => set({ registrationOpen: e.target.checked })}
                    label="접수 받기"
                    description='끄면 학부모 화면에 "접수 마감" 으로 보여요'
                  />

                  <Field label="마감 날짜" hint="비우면 시작 전까지" htmlFor="ev-deadline-date">
                    {(props) => (
                      // 날짜를 지우면 "마감 없음" 이다 — 시간만 남으면 저장이 막히니 함께 비운다.
                      <ClearableInput
                        {...props} type="date" value={form.deadlineDate}
                        onChange={(e) => set({ deadlineDate: e.target.value })}
                        onClear={() => set({ deadlineDate: '', deadlineTime: '' })}
                        clearLabel="마감 날짜 지우기"
                      />
                    )}
                  </Field>
                  <Field label="마감 시간" hint="비우면 23:59" htmlFor="ev-deadline-time">
                    {(props) => (
                      <ClearableInput
                        {...props} type="time" value={form.deadlineTime}
                        onChange={(e) => set({ deadlineTime: e.target.value })}
                        onClear={() => set({ deadlineTime: '' })}
                        clearLabel="마감 시간 지우기"
                      />
                    )}
                  </Field>
                </>
              )}
            </div>
          </Card>

          {form.type === 'competition' && (
            <Callout tone="brand" icon="award">
              대회형은 저장하면 <b>대회 데이터(참가 학생·종목·참가비)</b>가 함께 만들어져 기존
              [참가 학생 관리] 화면에서 그대로 쓸 수 있어요. 학부모 신청은 <b>[확정]</b> 해야
              참가 학생으로 올라갑니다.
            </Callout>
          )}
        </aside>

        {error && (
          <div className="event-form__error">
            <Callout tone="danger">{error}</Callout>
          </div>
        )}

        <AddressSearchDialog
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onSelect={pickAddress}
          query={form.address ? '' : form.location}
        />

        <MapPickerDialog
          open={mapPickerOpen}
          onClose={() => setMapPickerOpen(false)}
          onSelect={pickOnMap}
          latitude={form.latitude}
          longitude={form.longitude}
          address={form.address}
        />

        <div className="event-form__actions">
          {/* 좌표를 찾는 사이 저장하면 주소만 남고 지도가 빠진다 — 찾을 때까지(최대 10초) 기다린다 */}
          <Button type="submit" variant="primary" loading={saving} disabled={saving || locating}>
            {saving ? '저장 중...' : locating ? '위치 찾는 중...' : '저장'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(basePath)}>
            취소
          </Button>
        </div>
      </form>
    </Container>
  );
}

export default EventForm;
