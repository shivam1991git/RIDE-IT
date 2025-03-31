import './App.css';
import { Route, BrowserRouter, Routes, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import BookingCar from './pages/BookingCar';
import Services from './pages/Services';
import Feedback from './pages/Feedback';
import Cars from './pages/Cars';
import About from './pages/About';
import Contact from './pages/Contact';
import TouristPoint from './pages/TouristPoint';
import AddCar from './pages/AddCar';
import 'antd/dist/reset.css';
import UserBookings from './pages/UserBookings';
import AdminHome from './pages/AdminHome';
import EditCar from './pages/EditCar';
import Adminlogin from './pages/Adminlogin';
import DriverLogin from './pages/DriverLogin';
import DriverRegister from './pages/DriverRegister';
import Location from './pages/UserLocation';
import Profile from './pages/Profile';
import AdminRegister from './pages/AdminRegister';
import AdminUser from './pages/AdminUser';
import AddUser from './pages/AddUser';
import EditUser from './pages/EditUser';
import AdminDriver from './pages/AdminDriver';
import AddDriver from './pages/AddDriver';
import EditDriver from './pages/EditDriver';
import AdminDashboard from './pages/AdminDashboard';
import AdminFeedback from './pages/AdminFeedback';
import AdminBookings from './pages/AdminBookings';
import DriverBookings from './pages/DriverBookings';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProtectedRoute component={Home} />} />
          <Route path="/login" element={<Login />} />
          <Route path="/adminlogin" element={<Adminlogin />} />
          <Route path="/adminregister" element={< ProtectedAdminRoute component={AdminRegister} />} />
          <Route path="/register" element={<Register />} />
          <Route path="/driverlogin" element={<DriverLogin />} />
          <Route path="/driverregister" element={<DriverRegister />} />
          <Route path="/services" element={<ProtectedRoute component={Services} />} />
          <Route path="/touristpoint" element={<ProtectedRoute component={TouristPoint} />} />
          <Route path="/cars" element={<ProtectedRoute component={Cars} />} />
          <Route path="/editcar/:carid" element={<ProtectedAdminRoute component={EditCar} />} />  
          <Route path="/contact" element={<ProtectedRoute component={Contact} />} />
          <Route path="/feedback" element={<ProtectedRoute component={Feedback} />} />
          <Route path="/about" element={<ProtectedRoute component={About} />} />
          <Route path="/userbooking" element={<ProtectedUserRoute component={UserBookings} />} />
          <Route path="/booking/:carid" element={<ProtectedUserRoute component={BookingCar} />} />
          <Route path="/addcar" element={<ProtectedAdminRoute component={AddCar} />} />
          <Route path="/admin" element={<ProtectedAdminRoute component={AdminHome} />} />
          <Route path="/admindashboard" element={<ProtectedAdminRoute component={AdminDashboard} />} />
          <Route path="/location" element={<ProtectedRoute component={Location} />} />
          <Route path="/profile" element={<ProtectedRoute component={Profile} />} />
          <Route path="/adminuser" element={<ProtectedAdminRoute component={AdminUser} />} />
          <Route path="/adduser" element={<ProtectedAdminRoute component={AddUser} />} />
          <Route path="/edituser/:userid" element={<ProtectedAdminRoute component={EditUser} />} />
          <Route path="/admindriver" element={<ProtectedAdminRoute component={AdminDriver} />} />
          <Route path="/adddriver" element={<ProtectedAdminRoute component={AddDriver} />} />
          <Route path="/editdriver/:driverid" element={<ProtectedAdminRoute component={EditDriver} />} />
          <Route path="/adminfeedback" element={<ProtectedAdminRoute component={AdminFeedback} />} />
          <Route path="/adminbookings" element={<ProtectedAdminRoute component={AdminBookings} />} />

          <Route path="/driverbookings" element={<ProtectedRoute component={DriverBookings} />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;

export function ProtectedRoute({ component: Component, ...rest }) {
  if (localStorage.getItem('user') || localStorage.getItem('driver') || localStorage.getItem('admin')) {
    return <Component {...rest} />;
  }
  else {
    return <Navigate to="/login" />;
  }
}
export function ProtectedUserRoute({ component: Component, ...rest }) {
  if (localStorage.getItem('user')) {
    return <Component {...rest} />;
  }
  else {
    return <Navigate to="/login" />;
  }
}
export function ProtectedDriverRoute({ component: Component, ...rest }) {
  if (localStorage.getItem('driver')) {
    return <Component {...rest} />;
  }
  else {
    return <Navigate to="/driverlogin" />;
  }
}
export function ProtectedAdminRoute({ component: Component, ...rest }) {
  if (localStorage.getItem('admin')) {
    return <Component {...rest} />;
  } else {
    return <Navigate to="/adminlogin" />;
  }
}