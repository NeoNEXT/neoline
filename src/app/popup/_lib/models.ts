export class WalletCreation {
    constructor(
        public walletName: string = '',
        public password: string = '',
        public confirmPassword: string = ''
    ) { }
}

export class Transfer {
    constructor(
        public address: string = '',
        public amount: number = 0
    ) { }
}

export class WalletImport {
    constructor(
        public walletName: string = '',
        public password: string = '',
        public confirmPassword: string = '',
        public WIF: string = '',
        public EncrpytedKey: string = ''
    ) { }
}
