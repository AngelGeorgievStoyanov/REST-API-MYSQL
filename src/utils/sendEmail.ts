import nodemailer from 'nodemailer';


export default async function sendMail(email: string, html: string , subject:string) {




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
        subject: subject,

        html: html
    }

    await transport.sendMail(mailOptions);
}