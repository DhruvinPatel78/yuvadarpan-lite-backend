const nodemailer = require("nodemailer");

const mailSender = async (email, title, body) => {
  console.log("Sending mail sender...",email,title);
  try {
    //to send email ->  firstly create a Transporter
    // let transporter = nodemailer.createTransport({
    //   // host: process.env.MAIL_HOST, //-> Host SMTP detail
    //   host:"smtp.ethereal.email", //-> Host SMTP detail
    //   // auth: {
    //   //   user: process.env.MAIL_USER, //-> User's mail for authentication
    //   //   pass: process.env.MAIL_PASS, //-> User's password for authentication
    //   // },
    //   auth: {
    //     user: "wrkpczryiut@pretreer.com",
    //     pass: ";>^W*)Z{xT",
    //   },
    // });
    const transporter = nodemailer.createTransport({
      // host: "smtp.ethereal.email",
      service: "gmail",
      // port: 587,
      // secure: false, // Use `true` for port 465, `false` for all other ports
      auth: {
        user: "maddison53@ethereal.email",
        // user: "richardelis@fthcapital.com",
        pass: "jn7jnAPss4f63QBp6D",
        // pass: ";>^W*)Z{xT",
        // user: 'yash362001@gmail.com',
        // pass: 'yash@298744'
      },
    });

    //now Send e-mails to users
    // let info = await transporter.sendMail({
    //   from: "www.sandeepdev.me - Sandeep Singh",
    //   // to: `${email}`,
    //   to: `wrkpczryiut@pretreer.com`,
    //   subject: `${title}`,
    //   html: `${body}`,
    // });
    const info = await transporter.sendMail({
      from: 'yash362001@gmail.com', // sender address
      to: `${email}`, // list of receivers
      subject: "Hello ✔", // Subject line
      text: "Hello world?", // plain text body
      html: "<b>Hello world?</b>", // html body
    });

    console.log("Info is here: ", info);
    return info;
  } catch (error) {
    console.log(error.message);
  }
};

module.exports = mailSender;
