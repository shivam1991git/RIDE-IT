import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function Footer() {
    return (
<footer className="footer-container mt-5">
                <img src="assets/images/RIDE_IT.png" alt="Website Logo" className="footer-logo"></img>
                <div className="footer-content">
                    <div className="footer-section quick-links">
                        <ul>
                            <li><Link to="/">Home</Link></li>
                            <li><Link to="/feedback">Feedback</Link></li>
                            <li><Link to="/about">About</Link></li>
                            <li><Link to="/contact">Contact</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="footer-section1">
                    <p>Email: info@yourcabbooking.com</p>
                    <p>Phone: +1 (123) 456-7890</p>
                </div>

                <div className="separation-line"></div>

                <div className="footer-bottom">
                    <p>&copy; 2024 Online Cab Booking System. All rights reserved.</p>
                    <div className="social-icons">
                        <Link to="#" target="_blank"><img src="assets/images/insta.png" alt="Instagram" /></Link>
                        <Link to="#" target="_blank"><img src="assets/images/image.png" alt="Twitter" /></Link>
                        <Link to="#" target="_blank"><img src="assets/images/fb.png" alt="Facebook" /></Link>
                    </div>
                </div>
            </footer>
    );

}
export default Footer;