import React, { Component } from 'react'
import ChatBot from 'react-simple-chatbot'
import { Segment } from 'semantic-ui-react'

function Chatbot() {
  const steps = [
    {
      id: "Greet",
      message: "Hello,I am RIDI Welcome !",
      trigger: "Done",
    },
    {
      id: "Done",
      message: "Please enter your name!",
      trigger: "waiting1",
    },
    {
      id: "waiting1",
      user: true,
      trigger: "Name",
    },
    {
      id: "Name",
      message: "Hi {previousValue}, Please select your issue",
      trigger: "options",
    },
    {
      id: "options",
      options: [
        {
          value: "Rent a car",
          label: "Rent a car",
          trigger: "carType",
        },
        {
          value: "Reservation",
          label: "Reservation",
          trigger: "reservation",
        },
        {
          value: "Pricing",
          label: "Pricing",
          trigger: "pricing",
        },
        {
          value: "Locations",
          label: "Locations",
          trigger: "locations",
        },
        {
          value: "Insurance",
          label: "Insurance",
          trigger: "insurance",
        },
       
      ],
    },
    {
      id: "carType",
      message: "Great! What type of car are you looking to rent?",
      trigger: "carOptions",
    },
    {
      id: "carOptions",
      options: [
        {
          value: "Sedan",
          label: "Sedan",
          trigger: "confirmCarType",
        },
        {
          value: "SUV",
          label: "SUV",
          trigger: "confirmCarType",
        },
        {
          value: "Toyota",
          label: "Toyota",
          trigger: "confirmCarType",
        },
      
      ],
    },
    {
      id: "confirmCarType",
      message: "Confirming... You are interested in renting a {previousValue}?",
      trigger: "carTypeConfirmation",
    },
    {
      id: "carTypeConfirmation",
      options: [
        {
          value: "Yes",
          label: "Yes",
          trigger: "confirmDetails",
        },
        {
          value: "No",
          label: "No",
          trigger: "carOptions",
        },
      ],
    },
    {
      id: "confirmDetails",
      message: "Great! Please provide more details about your rental requirements.",
      trigger: "rentalDetails",
    },
    {
      id: "rentalDetails",
      user: true,
      trigger: "confirmRental",
    },
    {
      id: "confirmRental",
      message: "Thank you for providing the details. We'll process your request and get back to you shortly.",
      end: true,
    },
    {
      id: "reservation",
      message: "Would you like to make a reservation?",
      trigger: "reservationOptions",
    },
    {
      id: "reservationOptions",
      options: [
        {
          value: "Yes",
          label: "Yes",
          trigger: "confirmReservation",
        },
        {
          value: "No",
          label: "No",
          trigger: "options",
        },
      ],
    },
    {
      id: "confirmReservation",
      message: "Please provide your desired reservation date and time.",
      trigger: "reservationDetails",
    },
    {
      id: "reservationDetails",
      user: true,
      trigger: "confirmReservationDetails",
    },
    {
      id: "confirmReservationDetails",
      message: "Thank you! Your reservation has been confirmed.",
      end: true,
    },
    {
      id: "pricing",
      message: "What would you like to know about pricing?",
      trigger: "pricingOptions",
    },
    {
      id: "pricingOptions",
      options: [
        {
          value: "Hourly rates",
          label: "Hourly rates",
          trigger: "hourlyRates",
        },
        {
          value: "Daily rates",
          label: "Daily rates",
          trigger: "dailyRates",
        },
        
      ],
    },
    {
      id: "hourlyRates",
      message: "Our hourly rates vary depending on the car type and duration. Please provide more details if you'd like a quote.",
      trigger: "options",
    },
    {
      id: "dailyRates",
      message: "Our daily rates start from $XX/day. Would you like more information?",
      trigger: "options",
    },
    {
      id: "locations",
      message: "What locations are you interested in?",
      trigger: "locationOptions",
    },
    {
      id: "locationOptions",
      options: [
        {
          value: "Downtown",
          label: "Downtown",
          trigger: "downtownLocation",
        },
        {
          value: "Airport",
          label: "Airport",
          trigger: "airportLocation",
        },
        
      ],
    },
    {
      id: "downtownLocation",
      message: "Our downtown location is at XYZ Street. Would you like directions?",
      trigger: "options",
    },
    {
      id: "airportLocation",
      message: "Our airport location is at ABC Street. Would you like directions?",
      trigger: "options",
    },
    {
      id: "insurance",
      message: "What would you like to know about insurance options?",
      trigger: "insuranceOptions",
    },
    {
      id: "insuranceOptions",
      options: [
        {
          value: "Coverage details",
          label: "Coverage details",
          trigger: "coverageDetails",
        },
        {
          value: "Pricing",
          label: "Pricing",
          trigger: "insurancePricing",
        },
        
      ],
    },
    {
      id: "coverageDetails",
      message: "Our insurance coverage includes liability, collision, and comprehensive. Would you like more details?",
      trigger: "options",
    },
    {
      id: "insurancePricing",
      message: "Insurance pricing depends on the coverage level and car type. Would you like a quote?",
      trigger: "options",
    },

  ];
  return (
    <>
         <Segment floated='right' className="chatbot-container-small"> 
      <ChatBot steps={steps} 
        className="chatbot-body-small"
        contentStyle={{ overflowY: 'auto', maxHeight: '100%' }}
        userDelay={1000} 
      />
    </Segment>
    </>
  )
}

export default Chatbot;