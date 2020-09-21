const nameLimitation = [1, 32];
const passwordLimitation = [8, 128];
const pattern = `^.{${ passwordLimitation[0] },${ passwordLimitation[1] }}$`;

export const WalletInitConstant = {
    nameLimitation,
    passwordLimitation,
    pattern
};
