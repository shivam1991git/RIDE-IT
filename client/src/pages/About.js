import React from 'react';
import DefaultLayout from '../components/DefultLayout';
import Footer from '../components/footer';

function About() {
    return (
        <div className="aboutbody">
            <DefaultLayout />

            <div className="about">
                <h1 className="animate-fade-in">About Us</h1>
                <h3 className="animate-fade-in">Rating : 4.5 ⭐</h3>
                <div className="container-a">
                    <div className="feature animate-zoom-in">
                        <h2>Wide Selection of Vehicles</h2>
                        <p>Choose from a diverse range of vehicles including economy cars, SUVs, luxury sedans, and more.</p>
                    </div>
                    <div className="feature animate-zoom-in">
                        <h2>Transparent Pricing</h2>
                        <p>Our pricing is clear and upfront with no hidden fees, ensuring a hassle-free booking experience.</p>
                    </div>
                    <div className="feature animate-zoom-in">
                        <h2>24/7 Customer Support</h2>
                        <p>Our dedicated support team is available round the clock to assist you with any queries or concerns.</p>
                    </div>
                    <div className="feature animate-zoom-in">
                        <h2>Secure Booking</h2>
                        <p>Enjoy peace of mind with our secure booking system that protects your personal and payment information.</p>
                    </div>
                </div>

                <div className="separation"></div>

                <div className="team">
                    <h2 className="animate-fade-in">Our Team</h2>
                    <div className="team-member animate-slide-up">
                        <img src="assets/images/jhon.png" alt="Team Member" />
                        <h3>John Doe</h3>
                        <p>CEO</p>
                        <p>John is an experienced entrepreneur with a passion for innovation in the transportation industry.</p>
                    </div>
                    <div className="team-member animate-slide-up">
                        <img src="assets/images/jhon.png" alt="Team Member" />
                        <h3>Jane Smith</h3>
                        <p>CTO</p>
                        <p>Jane is a skilled technologist who leads our development team in creating cutting-edge solutions.</p>
                    </div>
                </div>

                <div className="separation"></div>

                <div className="drivers">
                    <h2 className="animate-fade-in">Our Drivers</h2>
                    <div className="driver animate-slide-up">
                        <img src="assets/images/jhon.png" alt="Driver" />
                        <h3>Michael Johnson</h3>
                        <p>Email: michael@example.com</p>
                    </div>
                    <div className="driver animate-slide-up">
                        <img src="assets/images/jhon.png" alt="Driver" />
                        <h3>Emily Brown</h3>
                        <p>Email: emily@example.com</p>
                    </div>
                </div>
            </div>

            <Footer />

            <style jsx>{`


                .about {
                    max-width: 80%;
                    margin: 20px auto;                 
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                }

                h1, h2, h3 {
                    margin: 0 0 20px 0;
                    padding-bottom: 10px;
                    border-bottom: 2px solid #eee;
                }

                p {
                    line-height: 1.6;
                    margin: 10px 0;
                }

                .container-a {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 20px;
                }

                .feature, .team-member, .driver {
                    flex: 1;
                    padding: 20px;
                   
                    border-radius: 10px;
                    transition: transform 0.3s ease;
                    cursor: pointer;
                }

                .feature:hover, .team-member:hover, .driver:hover {
                    transform: translateY(-10px);
                    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
                }

                .separation {
                    margin: 40px 0;
                    height: 2px;
                  
                }

                .team, .drivers {
                    text-align: center;
                }

                .team-member img, .driver img {
                    width: 100px;
                    height: 100px;
                    border-radius: 50%;
                    margin-bottom: 10px;
                }

                .animate-fade-in {
                    animation: fadeIn 1s ease-in-out;
                }

                .animate-slide-in {
                    animation: slideIn 1s ease-in-out;
                }

                .animate-zoom-in {
                    animation: zoomIn 1s ease-in-out;
                }

                .animate-slide-up {
                    animation: slideUp 1s ease-in-out;
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes slideIn {
                    from {
                        transform: translateX(-20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                @keyframes zoomIn {
                    from {
                        transform: scale(0.9);
                        opacity: 0;
                    }
                    to {
                        transform: scale(1);
                        opacity: 1;
                    }
                }

                @keyframes slideUp {
                    from {
                        transform: translateY(20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}

export default About;
