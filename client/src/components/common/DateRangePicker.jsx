import React, { useState, useEffect, useRef } from 'react';
import { DateRange } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { ko } from 'date-fns/locale';

/**
 * 날짜 범위 선택 공통 컴포넌트
 */
function DateRangePicker({ startDate, endDate, onDateChange, isMobile = false, label = "기간 선택" }) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    key: 'selection'
  });
  const [pickerPosition, setPickerPosition] = useState({ left: 0, right: 'auto' });
  const buttonRef = useRef(null);

  useEffect(() => {
    setDateRange({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      key: 'selection'
    });
  }, [startDate, endDate]);

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  };

  useEffect(() => {
    if (showDatePicker && buttonRef.current && !isMobile) {
      const rect = buttonRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const pickerWidth = 650;

      const spaceOnRight = windowWidth - rect.right;

      if (spaceOnRight < pickerWidth) {
        setPickerPosition({ left: 'auto', right: 0 });
      } else {
        setPickerPosition({ left: 0, right: 'auto' });
      }
    }
  }, [showDatePicker, isMobile]);

  useEffect(() => {
    if (isMobile) return;
    const handleClickOutside = (event) => {
      if (showDatePicker && !event.target.closest('.date-picker-container')) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker, isMobile]);

  useEffect(() => {
    if (isMobile && showDatePicker) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showDatePicker, isMobile]);

  const handleDateRangeChange = (item) => {
    setDateRange(item.selection);
    const newStartDate = formatDate(item.selection.startDate);
    const newEndDate = formatDate(item.selection.endDate);
    onDateChange(newStartDate, newEndDate);
  };

  return (
    <div className="date-picker-container" style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <button
        ref={buttonRef}
        className="btn btn-outline"
        onClick={() => setShowDatePicker(!showDatePicker)}
        style={{
          width: isMobile ? '100%' : 'auto',
          minWidth: '200px',
          textAlign: 'left',
          justifyContent: 'flex-start',
          gap: 'var(--spacing-sm)'
        }}
      >
        <span style={{ color: 'var(--color-gray-500)' }}>📅</span>
        <span>{formatDisplayDate(startDate)} ~ {formatDisplayDate(endDate)}</span>
      </button>
      {showDatePicker && (
        <>
          {isMobile && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'var(--overlay-scrim)',
                zIndex: 999
              }}
              onClick={() => setShowDatePicker(false)}
            />
          )}
          <div style={{
            position: isMobile ? 'fixed' : 'absolute',
            top: isMobile ? '50%' : '100%',
            left: isMobile ? '50%' : pickerPosition.left,
            right: isMobile ? 'auto' : pickerPosition.right,
            transform: isMobile ? 'translate(-50%, -50%)' : 'none',
            zIndex: 1000,
            backgroundColor: 'var(--surface)',
            border: 'var(--stroke)',
            boxShadow: 'var(--shadow-popover)',
            borderRadius: 'var(--shape-panel)',
            marginTop: isMobile ? 0 : 'var(--spacing-sm)',
            maxWidth: isMobile ? '95vw' : 'none',
            maxHeight: isMobile ? '90vh' : 'none',
            overflow: isMobile ? 'auto' : 'visible'
          }}>
            <DateRange
              ranges={[dateRange]}
              onChange={handleDateRangeChange}
              months={isMobile ? 1 : 2}
              direction={isMobile ? 'vertical' : 'horizontal'}
              locale={ko}
              rangeColors={['#000000']}
            />
            <div style={{
              padding: 'var(--spacing-lg)',
              borderTop: '1px solid var(--color-gray-200)',
              textAlign: 'right'
            }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowDatePicker(false)}
              >
                확인
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default DateRangePicker;
