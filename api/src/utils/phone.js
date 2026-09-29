function cleanPhone(phone) {
  if (!phone) return '';
  return phone.toString().replace(/\D/g, '');
}

function toJid(phone) {
  const digits = cleanPhone(phone);
  return digits ? `${digits}@s.whatsapp.net` : '';
}

module.exports = {
  cleanPhone,
  toJid,
};
