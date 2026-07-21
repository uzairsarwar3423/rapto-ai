import { CalendarProviderName } from '../integrations.types'
import { CalendarProvider } from './calendar-provider.interface'
import { googleCalendarProvider } from './google-calendar.provider'
import { outlookCalendarProvider } from './outlook-calendar.provider'

class CalendarProviderRegistry {
    private readonly providers: Record<CalendarProviderName, CalendarProvider>

    constructor() {
        this.providers = {
            GOOGLE_CALENDAR: googleCalendarProvider,
            OUTLOOK_CALENDAR: outlookCalendarProvider,
        }
    }

    getProvider(name: CalendarProviderName): CalendarProvider {
        const provider = this.providers[name]
        if (!provider) {
            throw new Error(`Calendar provider ${name} not registered`)
        }
        return provider
    }
}

export const calendarProviderRegistry = new CalendarProviderRegistry()
