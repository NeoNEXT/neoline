const nameLimitation = [1, 32];
const passwordLimitation = [8, 128];
const pattern = `^[0-9A-z_\\-\\+\\=\\,\\.\\:\\!]{${ passwordLimitation[0] },${ passwordLimitation[1] }}$`;

export const WalletInitConstant = {
    nameLimitation,
    passwordLimitation,
    pattern
};
