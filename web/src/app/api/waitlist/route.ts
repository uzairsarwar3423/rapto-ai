import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { z } from 'zod'

const waitlistSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  company: z.string().optional(),
  teamSize: z.string().min(1, "Please select your team size"),
  role: z.string().min(1, "Please select your role")
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // Validate request body
    const validatedData = waitlistSchema.safeParse(body)
    
    if (!validatedData.success) {
      const errorMessages = validatedData.error.issues.map(err => err.message)
      return NextResponse.json(
        { error: errorMessages.join(", ") },
        { status: 400 }
      )
    }
    
    const { name, email, company, teamSize, role } = validatedData.data
    
    // Check if email already exists
    const existingEntry = await prisma.waitlistEntry.findUnique({
      where: { email }
    })
    
    if (existingEntry) {
      // Return 200 even if they're already on the list, or we could return 400
      // For a better user experience on waitlists, you can pretend it's a success 
      // or tell them they are already on the list.
      return NextResponse.json({ message: "You are already on the waitlist!" })
    }
    
    // Create waitlist entry
    await prisma.waitlistEntry.create({
      data: {
        name,
        email,
        company: company || null,
        teamSize,
        role
      }
    })
    
    return NextResponse.json({ message: "Successfully joined the waitlist!" }, { status: 201 })
  } catch (error: any) {
    console.error('Waitlist API Error:', error)
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    )
  }
}
