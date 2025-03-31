import React, { useState } from 'react';

function UserLocation() {
    const [pickupLocation, setPickupLocation] = useState('');
    const [pickupTime, setPickupTime] = useState('');
    const [dropoffLocation, setDropoffLocation] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!pickupLocation.trim() || !dropoffLocation.trim()) {
            setError('Please enter both pickup and dropoff locations.');
            return;
        }

        console.log('Pickup Location:', pickupLocation);
        console.log('Pickup Time:', pickupTime);
        console.log('Dropoff Location:', dropoffLocation);
        
        // Proceed with form submission, e.g., redirecting to /cars
        window.location.href = '/cars';
    };

    return (
        <div className="user-location-container">
            <form className="booking-form" onSubmit={handleSubmit}>
                <div className="input-group">
                    <label>
                        Pickup Location:
                        <input
                            type='text'
                            value={pickupLocation}
                            onChange={(e) => setPickupLocation(e.target.value)}
                        />
                    </label>
                </div>
                <div className="input-group">
                    <label>
                        Pickup Time:
                        <input
                            type='time'
                            value={pickupTime}
                            onChange={(e) => setPickupTime(e.target.value)}
                        />
                    </label>
                </div>
                <div className="input-group">
                    <label>
                        Dropoff Location:
                        <input
                            type='text'
                            value={dropoffLocation}
                            onChange={(e) => setDropoffLocation(e.target.value)}
                        />
                    </label>
                </div>
                {error && <p className="error-message">{error}</p>}
                <button type="submit" className="btn-submit btn1">Select Car</button>
            </form>
        </div>
    );
}

export default UserLocation;
