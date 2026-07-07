const crypto = require('crypto');
function verifySignature(requestBody, secretKey, signatureHeader) {
  try {
    const parts = signatureHeader.split(';');
    const tsPart = parts.find(p => p.startsWith('ts='));
    const h1Part = parts.find(p => p.startsWith('h1='));
    if (!tsPart || !h1Part) return false;
    const ts = tsPart.split('=')[1];
    const h1 = h1Part.split('=')[1];
    
    const payload = ts + ':' + requestBody;
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(payload);
    const computedSig = hmac.digest('hex');
    console.log("Expected h1:", computedSig);
    console.log("Actual h1:  ", h1);
    return computedSig === h1;
  } catch (e) {
    return false;
  }
}
verifySignature('test body', 'secret', 'ts=123;h1=abc');
