import type { User } from '@/api'
export function Brand(){return <span className="z-brand"><img src="/assets/logo.svg" alt=""/><span>zently</span></span>}
export function Avatar({user,large=false}:{user:User;large?:boolean}){const account=(user as User & {username?:string}).username || user.name;return <span className={'z-avatar'+(large?' is-large':'')} aria-hidden="true">{Array.from(account.replace(/^@/,'')).slice(0,2).join('').toLocaleUpperCase('ru')}</span>}
