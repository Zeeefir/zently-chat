import { test } from "node:test";
import assert from "node:assert/strict";
import { CallSounds } from "../public/call-sounds.js";

class AudioContextFake {
  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.destination = {};
    this.oscillators = [];
  }
  async resume() {
    this.state = "running";
  }
  createOscillator() {
    const node = {
      frequency: { value: 0 },
      connect() {},
      disconnect() {},
      start() {
        node.started = true;
      },
      stop(at) {
        if (at === undefined) node.cancelled = true;
        else node.scheduled = true;
      },
    };
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
    };
  }
}
test('enabling previously disabled sounds unlocks audio without requiring a preview',async()=>{
 const sounds=new CallSounds({AudioContextClass:AudioContextFake,enabled:false});
 assert.equal(await sounds.unlock(),false);
 await sounds.setEnabled(true);
 try{assert.equal(sounds.context?.state,'running');assert.equal(sounds.play('outgoing'),true);}finally{sounds.stop();}
});
test("ring waits for audio unlock, switching and stop cancel all scheduled tones", async () => {
  const sounds = new CallSounds({ AudioContextClass: AudioContextFake });
  assert.equal(sounds.play("incoming"), false);
  await sounds.unlock();
  const first = [...sounds.context.oscillators];
  assert.ok(first.length > 0);
  assert.ok(first.every((n) => n.started));
  sounds.play("outgoing");
  assert.ok(first.every((n) => n.cancelled));
  assert.equal(sounds.mode, "outgoing");
  sounds.stop();
  assert.equal(sounds.interval, null);
  assert.equal(sounds.mode, null);
  assert.equal(sounds.nodes.size, 0);
  sounds.setEnabled(false);
  assert.equal(sounds.play("incoming"), false);
  assert.equal(sounds.interval, null);
});
