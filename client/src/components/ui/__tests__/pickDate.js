import { act, fireEvent, within } from '@testing-library/react';

/**
 * 테스트용 — DateField 를 열고, 그 날짜가 있는 달까지 넘긴 뒤 그 날을 누른다.
 * scope 는 screen 또는 within(dialog), name 은 칸의 이름(예: /^날짜/ — 이름 뒤에 지금 값이 붙는다).
 * 오늘 날짜에 따라 처음 보이는 달이 달라지므로 몇 달을 넘길지는 제목을 읽어 정한다.
 */
export async function pickDate(scope, name, iso) {
  const button = scope.getByRole('button', { name });
  if (button.getAttribute('aria-expanded') !== 'true') {
    await act(async () => { fireEvent.click(button); });
  }
  const calendar = within(document.getElementById(button.getAttribute('aria-controls')));
  const [year, month] = iso.split('-').map(Number);
  for (let guard = 0; guard < 1200; guard += 1) {
    const [, shownYear, shownMonth] = calendar.getByText(/^\d+년 \d+월$/).textContent.match(/(\d+)년 (\d+)월/).map(Number);
    const diff = (year - shownYear) * 12 + (month - shownMonth);
    if (diff === 0) break;
    await act(async () => { fireEvent.click(calendar.getByRole('button', { name: diff < 0 ? '이전 달' : '다음 달' })); });
  }
  const [, , day] = iso.split('-').map(Number);
  await act(async () => { fireEvent.click(calendar.getByRole('button', { name: new RegExp(`^${month}월 ${day}일 `) })); });
}
