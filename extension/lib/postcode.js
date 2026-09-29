import { t } from './messages.js';

// The postcode format of each origin country; an empty postcode is allowed (the setting is optional).
const PostcodeFormat = { NL: [/^\d{4} ?[A-Za-z]{2}$/, '1234 AB'], DE: [/^\d{5}$/, '12345'] };
export const postcodeProblem = (country, postcode) => {
  const f = PostcodeFormat[country];
  return !postcode || !f || f[0].test(postcode) ? '' : t('postcode.bad', { country, example: f[1] });
};
