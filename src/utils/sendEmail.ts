import * as nodemailer from 'nodemailer';


export default async function sendMail(email: string, html: string) {




    const transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.PASS_EMAIL
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Email verification - hack-trip.com',

        html: html
    }

    transport.sendMail(mailOptions, function (err, info) {
        if (err) {
            console.log(err)
            throw new Error(err.message)
        } else {
            console.log('Email sent: ' + info.response)
            return 'Email sent: ' + info.response
        }
    })
}