import { v4 as uuidv4 } from 'uuid'
import { Execute } from '../../messages/Blade'
import { deRegister, registerOnce, deRegisterAll } from '../../services/Handler'
import { CallState, CALL_STATES, DisconnectReason, CallConnectState, CALL_CONNECT_STATES, DEFAULT_CALL_TIMEOUT } from '../../util/constants/relay'
import { ICall, ICallOptions, ICallDevice, IMakeCallParams } from '../../util/interfaces'
// import logger from '../../util/logger'
import { reduceConnectParams } from '../helpers'
import Calling from './Calling'

export default class Call implements ICall {
  public id: string
  public nodeId: string
  public tag: string = uuidv4()

  private _prevState: number = 0
  private _state: number = 0
  private _prevConnectState: number = 0
  private _connectState: number = 0
  private _cbQueues: { [state: string]: Function } = {}
  // private _mediaControlId: string = ''

  constructor(protected relayInstance: Calling, protected options: ICallOptions) {
    this._attachListeners = this._attachListeners.bind(this)
    this._detachListeners = this._detachListeners.bind(this)
    const { call_id, node_id } = options
    if (call_id && node_id) {
      this.setup(call_id, node_id)
    }
    this.relayInstance.addCall(this)
  }

  setup(callId: string, nodeId: string) {
    this.id = callId
    this.nodeId = nodeId
    this._attachListeners()
  }

  begin() {
    const msg = new Execute({
      protocol: this.relayInstance.protocol,
      method: 'call.begin',
      params: {
        tag: this.tag,
        device: this.device
      }
    })

    return this._execute(msg)
  }

  async hangup() {
    this._callIdRequired()
    const msg = new Execute({
      protocol: this.relayInstance.protocol,
      method: 'call.end',
      params: {
        node_id: this.nodeId,
        call_id: this.id,
        reason: DisconnectReason.Hangup
      }
    })

    return this._execute(msg)
  }

  async answer() {
    this._callIdRequired()
    const msg = new Execute({
      protocol: this.relayInstance.protocol,
      method: 'call.answer',
      params: {
        node_id: this.nodeId,
        call_id: this.id
      }
    })

    return this._execute(msg)
  }

  async connect(...peers: IMakeCallParams[]) {
    this._callIdRequired()
    const devices = reduceConnectParams(peers, this.device)
    if (!devices.length) {
      throw new Error('No peers to connect!')
    }
    const msg = new Execute({
      protocol: this.relayInstance.protocol,
      method: 'call.connect',
      params: {
        node_id: this.nodeId,
        call_id: this.id,
        devices
      }
    })

    CALL_CONNECT_STATES.forEach(state => {
      deRegister(this.id, null, state)
      registerOnce(this.id, this._onConnectStateChange.bind(this, state), state)
    })

    return this._execute(msg)
  }

  /*
  async join(callsToJoin: Call | Call[]) { // TODO: wip
    this._callIdRequired()
    let calls = []
    if (callsToJoin instanceof Array) {
      calls = callsToJoin.map((c: Call) => c.id)
    } else if (callsToJoin instanceof Call) {
      calls = [callsToJoin.id]
    } else {
      throw new Error(`Unknow parameter type for join. ${callsToJoin}`)
    }
    if (!calls.length) {
      throw new Error('No Calls to join')
    }
    const msg = new Execute({
      protocol: this.relayInstance.protocol,
      method: 'call.join',
      params: {
        node_id: this.nodeId,
        call_id: this.id,
        calls
      }
    })

    return this._execute(msg)
  }

  async leave(callsToLeave: Call | Call[]) { // TODO: wip
    this._callIdRequired()
    let calls = []
    if (callsToLeave instanceof Array) {
      calls = callsToLeave.map((c: Call) => c.id)
    } else if (callsToLeave instanceof Call) {
      calls = [callsToLeave.id]
    } else {
      throw new Error(`Unknow parameter type for leave. ${callsToLeave}`)
    }
    if (!calls.length) {
      throw new Error('No Calls to leave')
    }
    const msg = new Execute({
      protocol: this.relayInstance.protocol,
      method: 'call.leave',
      params: {
        node_id: this.nodeId,
        call_id: this.id,
        calls
      }
    })

    return this._execute(msg)
  }

  playAudio(location: string) {
    const params = { type: 'audio', params: { location } }
    return this.playMedia(params)
  }

  playVideo(location: string) {
    const params = { type: 'video', params: { location } }
    return this.playMedia(params)
  }

  playSilence(duration: number) {
    const params = { type: 'silence', params: { duration } }
    return this.playMedia(params)
  }

  playTTS(options: { text: string, language: string, gender: string, name: string }) {
    const { text = null, language = 'en-US', gender = 'male', name = 'bob' } = options
    const params = { type: 'tts', params: { text, language, gender, name } }
    return this.playMedia(params)
  }

  async playMedia(...play: { type: string, params: any }[]) {
    this._callIdRequired()
    if (!play.length) {
      return
    }
    this._mediaControlId = uuidv4()
    const msg = new Execute({
      protocol: this.relayInstance.protocol,
      method: 'call.play',
      params: {
        node_id: this.nodeId,
        call_id: this.id,
        control_id: this._mediaControlId,
        play
      }
    })

    return this._execute(msg)
  }

  async stopMedia() {
    this._callIdRequired()
    if (!this._mediaControlId) {
      return
    }
    const msg = new Execute({
      protocol: this.relayInstance.protocol,
      method: 'call.play.stop',
      params: {
        node_id: this.nodeId,
        call_id: this.id,
        control_id: this._mediaControlId
      }
    })

    return this._execute(msg)
  }
  */

  get prevState() {
    return CallState[this._prevState]
  }

  get state() {
    return CallState[this._state]
  }

  get prevConnectState() {
    return CallConnectState[this._prevConnectState]
  }

  get connectState() {
    return CallConnectState[this._connectState]
  }

  get context() {
    return this.options.context
  }

  get peer(): Call {
    const { peer: { call_id = null } = {} } = this.options
    return this.relayInstance.getCallById(call_id)
  }

  setOptions(opts: ICallOptions) {
    this.options = { ...this.options, ...opts }
  }

  get device(): ICallDevice {
    return this.options.device
  }

  get ready(): boolean {
    return Boolean(this.id)
  }

  get type(): string {
    const { type } = this.options.device
    return type
  }

  get from(): string {
    const { params: { from_number = '' } = {} } = this.options.device
    return from_number
  }

  get to(): string {
    const { params: { to_number = '' } = {} } = this.options.device
    return to_number
  }

  get timeout(): number {
    const { params: { timeout = DEFAULT_CALL_TIMEOUT } = {} } = this.options.device
    return timeout
  }

  on(eventName: string, callback: Function) {
    const eventPermitted = CallState[eventName] && !isNaN(Number(CallState[eventName]))
    if (this.ready && eventPermitted) {
      if (this._state >= CallState[eventName]) {
        callback(this)
      } else {
        registerOnce(this.id, callback, eventName)
      }
    }
    this._cbQueues[eventName] = callback
    return this
  }

  off(eventName: string, callback?: Function) {
    if (this.ready) {
      deRegister(this.id, callback, eventName)
    }
    delete this._cbQueues[eventName]
    return this
  }

  private _onStateChange(newState: string) {
    this._prevState = this._state
    this._state = CallState[newState]
    this._dispatchCallback(newState)
    return this
  }

  private _onConnectStateChange(newState: string) {
    this._prevConnectState = this._connectState
    this._connectState = CallConnectState[newState]
    this._dispatchCallback(newState)
    return this
  }

  private _dispatchCallback(key: string) {
    if (this._cbQueues.hasOwnProperty(key)) {
      this._cbQueues[key](this)
    }
  }

  private _attachListeners() {
    registerOnce(this.id, this._detachListeners, CALL_STATES[CALL_STATES.length - 1])
    CALL_STATES.forEach(state => registerOnce(this.id, this._onStateChange.bind(this, state), state))
  }

  private _detachListeners() {
    deRegisterAll(this.id)
    this.relayInstance.removeCall(this)
  }

  private _callIdRequired() {
    if (!this.ready) {
      throw new Error('Call has not started.')
    }
  }

  private async _execute(msg: Execute) {
    try {
      const { result } = await this.relayInstance.session.execute(msg)
      return result
    } catch (error) {
      const { result = null } = error
      if (result) {
        throw result
      }
      throw error
    }
  }
}