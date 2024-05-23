const nodemailer = require("nodemailer");

const mailSender = async (email, title, body) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.email",
      service: "gmail",
      port: 587,
      secure: false, // Use `true` for port 465, `false` for all other ports
      auth: {
        user:process.env.USER,
        pass:process.env.PASSWORD,
      },
    });
    return await transporter.sendMail({
      from: {
        name: "YUVADRAPAN",
        address: process.env.USER,
      }, // sender address
      to: [`${email}`], // list of receivers
      subject: title, // Subject line
      text: title, // plain text body
      html: body, // html body
    });
  } catch (error) {
    console.log(error.message);
  }
};

module.exports = mailSender;
