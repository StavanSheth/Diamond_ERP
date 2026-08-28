import i18n from '../i18n';

export const getNumberLocale = () => {
  // Always use English digits with Indian numbering grouping (crore/lakh) as required
  return 'en-IN';
};

export const formatCurrency = (v: any) => {
  const num = Number(v) || 0;
  return '₹' + num.toLocaleString(getNumberLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatNumber = (v: any, minDigits = 2, maxDigits = 2) => {
  const num = Number(v) || 0;
  return num.toLocaleString(getNumberLocale(), { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
};
