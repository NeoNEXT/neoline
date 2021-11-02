const nameLimitation = [1, 32];
const passwordLimitation = [8, 128];
const pattern = `^.{${passwordLimitation[0]},${passwordLimitation[1]}}$`;
const emailPattern =
    '^[_a-z0-9-]+(.[_a-z0-9-]+)*@[a-z0-9-]+(.[a-z0-9-]+)*(.[a-z]{2,})$';

export const WalletInitConstant = {
    nameLimitation,
    passwordLimitation,
    pattern,
    emailPattern,
};
