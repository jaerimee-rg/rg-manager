import { calculateAge, formatDate } from '../dateHelpers';

describe('dateHelpers', () => {
  describe('calculateAge', () => {
    // Mock current date for consistent testing
    const MOCK_TODAY = new Date('2024-06-15');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(MOCK_TODAY);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('정상 케이스', () => {
      it('should calculate age correctly for birthday not yet passed this year', () => {
        const birthdate = '2010-12-25'; // Birthday later in year
        const age = calculateAge(birthdate);
        expect(age).toBe(13); // Not 14 yet
      });

      it('should calculate age correctly for birthday already passed this year', () => {
        const birthdate = '2010-01-10'; // Birthday earlier in year
        const age = calculateAge(birthdate);
        expect(age).toBe(14);
      });

      it('should calculate age correctly for birthday today', () => {
        const birthdate = '2010-06-15'; // Today
        const age = calculateAge(birthdate);
        expect(age).toBe(14);
      });

      it('should calculate age correctly when birthday is tomorrow', () => {
        const birthdate = '2010-06-16';
        const age = calculateAge(birthdate);
        expect(age).toBe(13); // Not 14 until tomorrow
      });

      it('should calculate age for very young child', () => {
        const birthdate = '2023-01-01';
        const age = calculateAge(birthdate);
        expect(age).toBe(1);
      });

      it('should calculate age for newborn (same year)', () => {
        const birthdate = '2024-01-01';
        const age = calculateAge(birthdate);
        expect(age).toBe(0);
      });

      it('should calculate age for adult', () => {
        const birthdate = '1990-03-20';
        const age = calculateAge(birthdate);
        expect(age).toBe(34);
      });

      it('should calculate age for senior', () => {
        const birthdate = '1950-07-15';
        const age = calculateAge(birthdate);
        expect(age).toBe(73);
      });
    });

    describe('월 경계 케이스', () => {
      it('should handle same month but day not reached', () => {
        const birthdate = '2010-06-20'; // Same month, day not reached
        const age = calculateAge(birthdate);
        expect(age).toBe(13);
      });

      it('should handle same month and day', () => {
        const birthdate = '2010-06-15'; // Same month and day
        const age = calculateAge(birthdate);
        expect(age).toBe(14);
      });

      it('should handle previous month', () => {
        const birthdate = '2010-05-15';
        const age = calculateAge(birthdate);
        expect(age).toBe(14);
      });

      it('should handle next month', () => {
        const birthdate = '2010-07-15';
        const age = calculateAge(birthdate);
        expect(age).toBe(13);
      });
    });

    describe('윤년 처리', () => {
      it('should handle leap year birthday (Feb 29)', () => {
        const birthdate = '2000-02-29';
        const age = calculateAge(birthdate);
        expect(age).toBe(24);
      });

      it('should calculate age in leap year', () => {
        jest.setSystemTime(new Date('2024-02-29'));
        const birthdate = '2000-02-29';
        const age = calculateAge(birthdate);
        expect(age).toBe(24);
      });

      it('should handle leap year birthday in non-leap year', () => {
        jest.setSystemTime(new Date('2023-03-01'));
        const birthdate = '2000-02-29';
        const age = calculateAge(birthdate);
        expect(age).toBe(23);
      });
    });

    describe('엣지 케이스', () => {
      it('should return "-" for null birthdate', () => {
        const age = calculateAge(null);
        expect(age).toBe('-');
      });

      it('should return "-" for undefined birthdate', () => {
        const age = calculateAge(undefined);
        expect(age).toBe('-');
      });

      it('should return "-" for empty string birthdate', () => {
        const age = calculateAge('');
        expect(age).toBe('-');
      });

      it('should handle invalid date string', () => {
        const age = calculateAge('invalid-date');
        expect(age).toBe('-');
      });

      it('should handle future birthdate (negative age)', () => {
        const birthdate = '2030-01-01';
        const age = calculateAge(birthdate);
        expect(age).toBe(-6);
      });
    });

    describe('다양한 날짜 형식', () => {
      it('should handle ISO date format', () => {
        const birthdate = '2010-06-15T00:00:00.000Z';
        const age = calculateAge(birthdate);
        expect(age).toBeGreaterThanOrEqual(13);
      });

      it('should handle Date object', () => {
        const birthdate = new Date('2010-06-15');
        const age = calculateAge(birthdate);
        expect(age).toBeGreaterThanOrEqual(13);
      });
    });

    describe('연말/연초 경계', () => {
      it('should handle birthday on Dec 31', () => {
        jest.setSystemTime(new Date('2024-12-30'));
        const birthdate = '2010-12-31';
        const age = calculateAge(birthdate);
        expect(age).toBe(13);
      });

      it('should handle birthday on Jan 1', () => {
        jest.setSystemTime(new Date('2024-01-02'));
        const birthdate = '2010-01-01';
        const age = calculateAge(birthdate);
        expect(age).toBe(14);
      });

      it('should handle year transition', () => {
        jest.setSystemTime(new Date('2024-01-01'));
        const birthdate = '2010-12-31';
        const age = calculateAge(birthdate);
        expect(age).toBe(13);
      });
    });
  });

  describe('formatDate', () => {
    describe('full format', () => {
      it('should format date in full format', () => {
        const result = formatDate('2024-06-15', 'full');
        expect(result).toBe('2024년 6월 15일 (토)');
      });

      it('should format date with single digit month and day', () => {
        const result = formatDate('2024-01-05', 'full');
        expect(result).toBe('2024년 1월 5일 (금)');
      });

      it('should include correct weekday', () => {
        const result = formatDate('2024-12-25', 'full');
        expect(result).toBe('2024년 12월 25일 (수)');
      });
    });

    describe('short format', () => {
      it('should format date in short format', () => {
        const result = formatDate('2024-06-15', 'short');
        expect(result).toBe('6월 15일 (토)');
      });

      it('should format date in short format (default)', () => {
        const result = formatDate('2024-06-15');
        expect(result).toBe('6월 15일 (토)');
      });

      it('should handle single digit values', () => {
        const result = formatDate('2024-01-01', 'short');
        expect(result).toBe('1월 1일 (월)');
      });
    });

    describe('compact format', () => {
      it('should format date in compact format', () => {
        const result = formatDate('2024-06-15', 'compact');
        expect(result).toBe('6/15(토)');
      });

      it('should handle double digit values', () => {
        const result = formatDate('2024-12-31', 'compact');
        expect(result).toBe('12/31(화)');
      });

      it('should handle single digit values', () => {
        const result = formatDate('2024-01-05', 'compact');
        expect(result).toBe('1/5(금)');
      });
    });

    describe('default format', () => {
      it('should use default format when format not specified', () => {
        const result = formatDate('2024-06-15', 'unknown');
        expect(result).toBe('6월 15일');
      });

      it('should handle null format', () => {
        const result = formatDate('2024-06-15', null);
        expect(result).toBe('6월 15일');
      });
    });

    describe('요일 처리', () => {
      it('should show correct weekday for Sunday', () => {
        const result = formatDate('2024-06-16', 'short');
        expect(result).toContain('(일)');
      });

      it('should show correct weekday for Monday', () => {
        const result = formatDate('2024-06-17', 'short');
        expect(result).toContain('(월)');
      });

      it('should show correct weekday for Tuesday', () => {
        const result = formatDate('2024-06-18', 'short');
        expect(result).toContain('(화)');
      });

      it('should show correct weekday for Wednesday', () => {
        const result = formatDate('2024-06-19', 'short');
        expect(result).toContain('(수)');
      });

      it('should show correct weekday for Thursday', () => {
        const result = formatDate('2024-06-20', 'short');
        expect(result).toContain('(목)');
      });

      it('should show correct weekday for Friday', () => {
        const result = formatDate('2024-06-21', 'short');
        expect(result).toContain('(금)');
      });

      it('should show correct weekday for Saturday', () => {
        const result = formatDate('2024-06-15', 'short');
        expect(result).toContain('(토)');
      });
    });

    describe('엣지 케이스', () => {
      it('should handle ISO date string with time', () => {
        // 화면에는 보는 사람의 지역 날짜를 보여준다. UTC 날짜를 못박으면
        // 한국(UTC+9)처럼 날짜가 넘어가는 시간대에서 테스트가 깨진다.
        const iso = '2024-06-15T15:30:00.000Z';
        const local = new Date(iso);
        const result = formatDate(iso, 'short');
        expect(result).toMatch(
          new RegExp(`${local.getMonth() + 1}월 ${local.getDate()}일 \\([일-토]\\)`)
        );
      });

      it('should handle leap year date', () => {
        const result = formatDate('2024-02-29', 'short');
        expect(result).toBe('2월 29일 (목)');
      });

      it('should handle year start date', () => {
        const result = formatDate('2024-01-01', 'full');
        expect(result).toBe('2024년 1월 1일 (월)');
      });

      it('should handle year end date', () => {
        const result = formatDate('2024-12-31', 'full');
        expect(result).toBe('2024년 12월 31일 (화)');
      });

      it('should handle invalid date gracefully', () => {
        const result = formatDate('invalid-date', 'short');
        expect(result).toContain('월');
      });
    });

    describe('다양한 입력 형식', () => {
      it('should handle Date object', () => {
        const date = new Date('2024-06-15');
        const result = formatDate(date.toISOString(), 'short');
        expect(result).toMatch(/6월 15일 \([일-토]\)/);
      });

      it('should handle different date separators', () => {
        const result = formatDate('2024/06/15', 'short');
        expect(result).toMatch(/6월 15일 \([일-토]\)/);
      });
    });
  });

  describe('Integration tests', () => {
    it('should work together for student data display', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15'));

      const birthdate = '2010-03-20';
      const age = calculateAge(birthdate);
      const formattedBirthdate = formatDate(birthdate, 'short');

      expect(age).toBe(14);
      expect(formattedBirthdate).toBe('3월 20일 (토)');

      jest.useRealTimers();
    });

    it('should handle multiple date operations', () => {
      const dates = [
        '2010-01-01',
        '2015-06-15',
        '2020-12-31',
      ];

      dates.forEach(date => {
        const formatted = formatDate(date);
        expect(formatted).toContain('월');
        expect(formatted).toContain('일');
      });
    });
  });
});
