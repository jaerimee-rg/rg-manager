import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 데이터 표. 모바일(768px 미만)에서는 각 행이 카드로 쌓이고
 * 셀 앞에 컬럼 라벨이 붙는다 — 가로 스크롤을 피하기 위해서다.
 *
 * columns: [{ key, header, render?, numeric?, hideOnMobile?, width?, hidden? }]
 *
 * hidden(row) 이 true 면 그 행에서만 칸이 비고, 모바일 카드에서는 줄 자체가 사라진다.
 * (종류에 따라 해당 없는 칸 — 예: 휴관일의 장소·신청 — 을 "—" 로 채우지 않기 위해서다)
 */
export function DataTable({
  columns = [],
  rows = [],
  rowKey = (row, i) => row.id ?? i,
  onRowClick,
  caption,
  stackOnMobile = true,
  empty,
  className = '',
  ...rest
}) {
  if (!rows.length && empty) return empty;

  return (
    <div className={cx('ui-table-wrap', className)} data-stack-mobile={stackOnMobile || undefined} {...rest}>
      {caption && <div className="ui-table__caption">{caption}</div>}
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" data-numeric={col.numeric || undefined} style={col.width ? { width: col.width } : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              data-clickable={onRowClick ? 'true' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => {
                const blank = col.hidden?.(row) || false;
                return (
                  <td
                    key={col.key}
                    data-label={col.hideLabelOnMobile ? '' : col.header}
                    data-numeric={col.numeric || undefined}
                    data-blank={blank || undefined}
                  >
                    {blank ? null : col.render ? col.render(row, i) : row[col.key]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
