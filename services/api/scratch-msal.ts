import { outlookCalendarProvider } from './src/modules/integrations/providers/outlook-calendar.provider'
import { env } from './src/config/env'

async function testOutlook() {
    console.log('--- Outlook Calendar Integration Test ---')
    console.log('Outlook Client ID configured:', !!env.OUTLOOK_CLIENT_ID)
    console.log('Outlook Client Secret configured:', !!env.OUTLOOK_CLIENT_SECRET)
    console.log('Outlook Callback URL configured:', !!env.OUTLOOK_CALLBACK_URL)
    
    try {
        const authUrl = outlookCalendarProvider.getAuthorizationUrl('fake-state-123', 'fake-user-id')
        console.log('\n✅ Successfully generated Authorization URL:')
        console.log(authUrl)
    } catch (e: any) {
        console.error('\n❌ Failed to generate Authorization URL:')
        console.error(e.message)
    }
}

testOutlook()
