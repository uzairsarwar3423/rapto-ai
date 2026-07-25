import { emailService } from './src/modules/notifications/email.service'
import axios from 'axios'
import { env } from './src/config/env'

async function debugBrevoAPI() {
  console.log('--- TESTING BREVO API DIRECT HTTP DISPATCH ---')
  console.log('BREVO_API_KEY present:', !!env.BREVO_API_KEY)
  console.log('BREVO_FROM_EMAIL:', env.BREVO_FROM_EMAIL)

  const payload = {
    sender: { name: 'Vocaply', email: env.BREVO_FROM_EMAIL || 'uzairsarwar542@gmail.com' },
    to: [{ email: 'uzairsarwar542@gmail.com', name: 'Uzair Sarwar' }],
    subject: 'Industry Test Welcome Email',
    htmlContent: '<h1>Welcome to Vocaply!</h1><p>This is a live test email.</p>',
  }

  try {
    const res = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY,
      },
    })
    console.log('STATUS:', res.status)
    console.log('RESPONSE DATA:', res.data)
  } catch (err: any) {
    console.error('ERROR RESPONSE:', err.response?.status, err.response?.data || err.message)
  }
}

debugBrevoAPI()
