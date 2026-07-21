import { ConfidentialClientApplication } from '@azure/msal-node'
console.log(Object.keys(new ConfidentialClientApplication({auth: {clientId: 'a', authority: 'b'}})))
