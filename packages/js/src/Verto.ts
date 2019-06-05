import BrowserSession from '../../common/src/BrowserSession'
import { SubscribeParams, BroadcastParams, DialogOptions } from '../../common/src/util/interfaces'
import { Login } from '../../common/src/messages/Verto'
import Dialog from '../../common/src/webrtc/Dialog'
import { SwEvent, SESSION_ID } from '../../common/src/util/constants'
import { trigger } from '../../common/src/services/Handler'
import * as Storage from '../../common/src/util/storage/'
import VertoHandler from '../../common/src/webrtc/VertoHandler'

export const VERTO_PROTOCOL = 'verto-protocol'
export default class Verto extends BrowserSession {
  validateOptions() {
    const { host, login, passwd, password } = this.options
    return Boolean(host) && Boolean(login && (passwd || password))
  }

  newCall(options: DialogOptions) {
    const { destinationNumber = null } = options
    if (!destinationNumber) {
      throw new Error('Verto.newCall() error: destinationNumber is required.')
    }
    const dialog = new Dialog(this, options)
    dialog.invite()
    return dialog
  }

  broadcast(params: BroadcastParams) {
    return this.vertoBroadcast(params)
  }

  subscribe(params: SubscribeParams) {
    return this.vertoSubscribe(params)
  }

  unsubscribe(params: SubscribeParams) {
    return this.vertoUnsubscribe(params)
  }

  protected async _onSocketOpen() {
    const { login, password, passwd, userVariables } = this.options
    const msg = new Login(login, (password || passwd), this.sessionid, userVariables)
    const response = await this.execute(msg).catch(this._handleLoginError)
    if (response) {
      this.sessionid = response.sessid
      Storage.setItem(SESSION_ID, this.sessionid)
      trigger(SwEvent.Ready, this, this.uuid)
    }
  }

  protected _onSocketMessage(msg: any) {
    const handler = new VertoHandler(this)
    handler.handleMessage(msg)
  }

  get webRtcProtocol() {
    return VERTO_PROTOCOL
  }
}