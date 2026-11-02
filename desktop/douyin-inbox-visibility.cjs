// Public pcim build 1.0.0.1016, 7750.7e9c1cf7.js:
// isNormalMsg: type < 50000; isSpecialMessage: type >= 50000;
// visible excludes special messages. 50001 is MESSAGE_TYPE_COMMAND.
// This is display classification only: do not execute command payloads, delete
// archives, change receipt/unread state, or suppress unknown normal types.
const isChatMessageType=type=>!(Number.isSafeInteger(type)&&type>=50000);
module.exports={isChatMessageType};
