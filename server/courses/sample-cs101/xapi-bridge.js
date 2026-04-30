// xapi-bridge.js — included by every lesson. Sends statements to the host PWA via postMessage.
(function () {
  function newId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xs-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }
  window.xapi = {
    send: function (verbIri, objectId, result) {
      var statement = {
        id: newId(),
        actor: { account: { homePage: 'foundation://device', name: 'self' } },
        verb: { id: verbIri, display: { 'it-IT': verbIri.split('/').pop() } },
        object: { id: objectId, definition: {} },
        result: result || undefined,
        timestamp: new Date().toISOString()
      };
      try {
        window.parent.postMessage({ type: 'foundation.xapi', v: 1, statement: statement }, '*');
      } catch (e) { /* ignore */ }
      return statement.id;
    }
  };
})();
