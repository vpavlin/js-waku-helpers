export type Verify = {
    address: string
    code: string
    publicKey: string
}

export type Confirm = {
    address: string
    code: string
}

export type Paired = {
    address: string
}

export type Send = {
    value: string
}

export type PairedAccount = {
    address: string
    publicKey: string
}

export type PairedAccounts = Map<string, PairedAccount>