// Keep both the app and every official Electron guest silent, including hidden
// upload/profile windows. This changes audio output only, never platform state.
function registerSilentAudio({ app }) {
  app.commandLine.appendSwitch('mute-audio');
  app.on('web-contents-created', (_event, contents) => {
    contents.setAudioMuted(true);
  });
}

module.exports = { registerSilentAudio };
