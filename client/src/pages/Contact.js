import React from 'react'
import DefultLayout from '../components/DefultLayout'
import Footer from '../components/footer';


function Contact() {
  return (
    <div className="contactbody">
      <DefultLayout/>
   
      <div className="contact-container">
        <div className="contact-info">
          <h2>Contact Us</h2>
          <p>For any inquiries, please feel free to reach out to us:</p>
          <ul>
            <h3>Email: </h3>
            <li>info@example.com</li>
            <h3>Phone:</h3>
            <li>+1234567890</li>
            <li>+1234567890</li>
            <h3>Address: </h3>
            <li> 123 Street, City, Country</li>
          </ul>
        </div>
        <div className="map-container">
          <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2482.780738010749!2d92.830537!3d26.702908!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNTbCsDQwJzA1LjkiTiA5MsKwODknMjIuNSJF!5e0!3m2!1sen!2suk!4v1647487323343!5m2!1sen!2suk"
            width="600" height="450" style={{ border: '0' }} allowfullscreen="" loading="lazy"></iframe>
        </div>
      </div>
     <Footer/>
    </div>
  )
}

export default Contact