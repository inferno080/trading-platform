import { decode, encode } from "@msgpack/msgpack";
import { makeDelta, makeSession, makeSnapshot, makeUpdate } from "../../support/fixtures";
import { decodeServerMessage, encodeClientMessage } from "../../../src/protocol/codec";

describe("protocol codec", () => {
  it("encodes a resync request that decodes back to the same message", () => {
    expect(decode(encodeClientMessage({ t: "resync" }))).to.deep.equal({ t: "resync" });
  });

  it("returns bytes backed by a plain ArrayBuffer, which is what WebSocket.send accepts", () => {
    const { buffer } = encodeClientMessage({ t: "resync" });
    expect(Object.prototype.toString.call(buffer)).to.equal("[object ArrayBuffer]");
  });

  it("decodes every kind of server message", () => {
    const messages = [makeSession(), makeSnapshot(1), makeDelta(2, [makeUpdate(0)])];
    for (const message of messages) {
      expect(decodeServerMessage(encode(message))).to.deep.equal(message);
    }
  });
});
