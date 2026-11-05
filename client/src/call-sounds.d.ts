export class CallSounds {
  constructor(options?: {enabled?:boolean});
  enabled:boolean;
  unlock():Promise<boolean>;
  play(mode:'incoming'|'outgoing'):boolean;
  stop():void;
  setEnabled(value:boolean):Promise<boolean>|undefined;
}
