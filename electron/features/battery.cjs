// Confirms plug/unplug from Windows' power monitor. The renderer also listens to navigator.getBattery(); whichever
// reports a change first triggers the animation and the other is ignored there.
module.exports = {
  id: 'battery',
  defaultEnabled: true,
  start(ctx) {
    if (process.platform !== 'win32') return;
    let pm = null;
    const onAc = () => { if (ctx.enabled()) ctx.send({ ac: true }); };
    const onBattery = () => { if (ctx.enabled()) ctx.send({ ac: false }); };
    try {
      pm = require('electron').powerMonitor;
      pm.on('on-ac', onAc);
      pm.on('on-battery', onBattery);
    } catch (e) { ctx.log('power monitor unavailable:', e.message); }
    return () => { try { pm?.removeListener('on-ac', onAc); pm?.removeListener('on-battery', onBattery); } catch {} };
  }
};
