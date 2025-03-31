import React from 'react'
import DefultLayout from '../components/DefultLayout'
import Footer from '../components/footer';
import { Link } from 'react-router-dom';

function touristpoint() {

    const user = JSON.parse(localStorage.getItem('user'));


    return (
        <div className="tourist">
            <DefultLayout />

            <div className="main-tariff">
                <section className="first">
                    <div className="secImg">
                        <img src="assets/images/kashi-vishwanath-dham-163929169216x9.avif" alt="tour1" />
                    </div>
                    <div>
                        <span>Kashi Vishwanath Temple</span>
                        <span>"Kashi Vishwanath Temple, nestled along the sacred banks of the Ganges, stands as a timeless symbol of devotion and spirituality."</span>
                        {user ?(
                        <Link to="/cars" className="select-car-btn">Select Car</Link>
                        ): null}
                    </div>

                </section>

                <div className="separation"></div>

                <section className="first second">
                    <div className="secImg">
                        <img src="assets/images/ganga-aarti-varansai-india.avif" alt="" />
                    </div>
                    <div>
                        <span>Assi Ghat</span>
                        <span>"Ganga Aarti: a mesmerizing symphony of lamps, prayers, and devotion, where the sacred Ganges becomes a canvas for spiritual transcendence."</span>
                        {user ?(
                        <Link to="/cars" className="select-car-btn">Select Car</Link>
                    ): null}
                    </div>
                </section>

                <div className="separation"></div>

                <section className="first second">
                    <div className="secImg">
                        <img src="assets/images/Ahilya_Ghat_by_the_Ganges,_Varanasi.jpg" alt="" />
                    </div>
                    <div>
                        <span>Ahilya Ghat</span>
                        <span>"At the Ghats of the Ganges, the convergence of rituals, prayers, and daily life creates a vibrant tapestry of devotion and reverence.".</span>
                        {user ?(
                        <Link to="/cars" className="select-car-btn">Select Car</Link>
                    ): null}
                    </div>
                </section>

                <div className="separation"></div>
                <Footer />
            </div>
        </div>
    )
}

export default touristpoint