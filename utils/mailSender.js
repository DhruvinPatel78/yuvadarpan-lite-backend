const nodemailer = require("nodemailer");

const mailSender = async (email, title, body) => {
  console.log("Sending mail sender...",email,title);
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
    const info = await transporter.sendMail({
      from: {
        name:"YUVADRAPAN",
        address:process.env.USER,
      }, // sender address
      to: [`${email}`], // list of receivers
      // to: [`${email}`], // list of receivers
      subject: title, // Subject line
      text: title, // plain text body
      html:body, // html body
    });

    console.log("mail send successfully ", info);
    return info;
  } catch (error) {
    console.log(error.message);
  }
};

module.exports = mailSender;
