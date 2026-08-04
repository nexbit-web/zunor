// src/lib/mailer.ts
import nodemailer from 'nodemailer'
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} from '$env/static/private'

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: Number(SMTP_PORT) === 465, // SSL для 465, STARTTLS для 587
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
})

export { SMTP_FROM }
