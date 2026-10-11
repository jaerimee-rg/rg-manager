import React from 'react';
import { Badge, Button, Callout, Card, Icon, Switch } from '../../components/ui';
import { AUDIENCE_LABELS, isPhotoFolder, publishNotifiesParents, publishSummary, zeroAudienceWarning } from './albumState';

/**
 * 앨범 화면 위쪽의 "학부모 공개" 패널 (docs/photo-menu FR-521~522, 526, 529).
 *
 * 앨범은 비공개로 시작한다. 공개하면 학부모 사진 탭과 그 이벤트 상세 두 곳에 보이고,
 * 공개 범위는 참가 확정 학부모(기본) / 모든 학부모 중에 고른다.
 * 사진 전용 폴더(FR-517)는 이벤트가 아니라서 사진 탭 한 곳에만 보이고, 신청한 학생이 없으니
 * 공개 범위는 고르지 않는다 — 언제나 모든 학부모다. 사진 폴더를 처음 공개하면 알림을 켠 학부모에게 "새 사진" 알림이 간다.
 */
function PublishPanel({ album, locked = false, busy = false, onPublish, onAudience, onUploadOpen }) {
  const summary = publishSummary(album);
  const audience = album.audience || 'participants';
  const counts = album.viewerCounts || {};
  const showZero = !summary.on && zeroAudienceWarning(album);
  const disabled = locked || busy;
  const folder = isPhotoFolder(album.eventType);
  const pushes = !summary.on && publishNotifiesParents({ type: album.eventType, publishedAt: album.publishedAt });

  const option = (key, hint) => {
    const selected = audience === key;
    return (
      <button
        type="button"
        className="ui-choice"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => !selected && onAudience?.(key)}
      >
        <span className="ui-choice__mark" data-on={selected || undefined}><Icon name="check" size={14} /></span>
        <span>
          <span className="ui-publish__option-title">{AUDIENCE_LABELS[key]} · {key === 'all' ? counts.all || 0 : counts.participants || 0}명</span>
          <span className="ui-publish__option-hint">{hint}</span>
        </span>
      </button>
    );
  };

  return (
    <Card padding="md" aria-label="학부모 공개">
      <div className="ui-publish">
        <div className="ui-row" data-gap="3" data-justify="between">
          <h3 className="ui-card__title">학부모 공개</h3>
          {summary.on ? <Badge tone="success" dot>공개</Badge> : <Badge tone="muted" dot>비공개</Badge>}
        </div>

        <div className="ui-publish__status">
          <span className="ui-publish__lamp" data-on={summary.on || undefined} aria-hidden="true" />
          <span className="ui-publish__state">{summary.state}</span>
          <span className="ui-publish__who">{summary.who}</span>
        </div>

        <div>
          <div className="ui-field__label ui-mb-2">공개 범위</div>
          {folder ? (
            <p className="ui-text-sm">
              {AUDIENCE_LABELS.all} · {counts.all || 0}명 <span className="ui-text-muted">— 이벤트가 아닌 사진 폴더라 연결된 학부모 모두가 봐요</span>
            </p>
          ) : (
            <div className="ui-publish__audience" role="group" aria-label="공개 범위">
              {option('participants', album.eventType === 'competition'
                ? '이 대회에 확정된 학생의 학부모'
                : '이 이벤트에 신청이 확정된 학생의 학부모')}
              {option('all', '선생님과 연결된 학부모 전체')}
            </div>
          )}
        </div>

        <div>
          <div className="ui-field__label ui-mb-2">{summary.on ? '보이는 곳' : '공개하면 보이는 곳'}</div>
          <div className="ui-row ui-text-sm" data-gap="4" data-wrap="true">
            <span className="ui-row" data-gap="1"><Icon name="image" size={16} />학부모 ‘사진’ 탭</span>
            {!folder && <span className="ui-row" data-gap="1"><Icon name="calendar" size={16} />‘{album.eventTitle}’ 이벤트 상세</span>}
          </div>
        </div>

        {showZero && (
          <Callout tone="warning">
            <b>이 이벤트에는 확정된 학생이 없어요.</b> 지금 공개하면 아무도 볼 수 없어요.
            공개 범위를 ‘모든 학부모’로 바꿔 주세요.
          </Callout>
        )}

        <div className="ui-publish__actions">
          {summary.on ? (
            <Button icon="lock" disabled={disabled} loading={busy} onClick={() => onPublish?.(false)}>비공개로 전환</Button>
          ) : (
            <Button variant="primary" icon="eye" disabled={disabled} loading={busy} onClick={() => onPublish?.(true)}>학부모에게 공개</Button>
          )}
          <span className="ui-text-sm ui-text-muted">
            {folder
              ? (summary.on
                ? '비공개로 돌리면 사진 탭에서 바로 사라져요.'
                : `누르면 사진 탭에 바로 나타나요.${pushes ? ' 알림을 켠 학부모에게 새 사진 알림도 가요.' : ''}`)
              : (summary.on ? '비공개로 돌리면 두 곳 모두에서 바로 사라져요.' : '누르면 위 두 곳에 바로 나타나요.')}
          </span>
        </div>

        <hr className="ui-publish__divider" />

        <div className="ui-switch-field">
          <Switch
            label="학부모도 사진 올리기"
            checked={album.albumUploadOpen !== false}
            disabled={disabled || !summary.on}
            onChange={(event) => onUploadOpen?.(event.target.checked)}
          />
          <p className="ui-switch-field__description">
            {summary.on
              ? `공개된 동안 학부모가 사진·영상을 올릴 수 있어요.${album.counts?.fromParents ? ` 지금까지 ${album.counts.fromParents}장을 올렸어요.` : ''}`
              : '공개하면 적용돼요. 공개된 동안 학부모도 이 앨범에 올릴 수 있어요.'}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default PublishPanel;
