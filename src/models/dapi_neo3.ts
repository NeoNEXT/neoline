export enum requestTargetN3 {
    Provider = 'neoline.target_provider_n3',
    Networks = 'neoline.target_networks_n3',
    Account = 'neoline.target_account_n3',
    AccountPublicKey = 'neoline.target_public_key_n3',
    Storage = 'neoline.target_storage_n3',
    InvokeRead = 'neoline.target_invoke_read_n3',
    InvokeReadMulti = 'neoline.target_invoke_read_multi_n3',
    VerifyMessage = 'neoline.target_verify_message_n3',
    Transaction = 'neoline.target_transaction_n3',
    Block = 'neoline.target_block_n3',
    ApplicationLog = 'neoline.target_application_log_n3',
    Invoke = 'neoline.target_invoke_n3',
    InvokeMulti = 'neoline.target_invoke_multi_n3',
    SignMessage = 'neoline.target_sign_message_n3',
    Deploy = 'neoline.target_deploy_n3',
    Send = 'neoline.target_send_n3',
    Connect = 'neoline.target_connect_n3',
    AuthState = 'neoline.target_auth_state_n3',
    Login = 'neoline.target_login_n3',
    Balance = 'neoline.target_balance_n3',
    InvokeMultiple = 'neoline.target_invoke_multiple_n3',
}

export enum AuthType {
    None = 'None',
    CalledByEntry = 'CalledByEntry',
    CustomContracts = 'CustomContracts',
    CustomGroups = 'CustomGroups',
    Global = 'Global'
}
