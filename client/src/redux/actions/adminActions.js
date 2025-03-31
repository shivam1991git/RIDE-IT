import axios from 'axios'
import { message } from 'antd'


export const adminLogin = (reqObj) => async dispatch => {

    dispatch({ type: 'LOADING', payload: true })

    try {
        const response = await axios.post('/api/admins/adminlogin', reqObj)
        localStorage.setItem('admin', JSON.stringify(response.data))
        message.success('Login Successfull !')
        dispatch({ type: 'LOADING', payload: false })
        setTimeout(()=>{
            window.location.href = '/admindashboard'
           
        }, 500);

    } catch (error) {
        console.log(error)
        message.error('someting wrong')
        dispatch({ type: 'LOADING', payload: false })

    }
}

export const adminRegister = (reqObj) => async dispatch => {

    dispatch({ type: 'LOADING', payload: true })

    try {
        const response = await axios.post('/api/admins/adminregister', reqObj)
        message.success('Registration Successfull !')
        setTimeout(()=>{
            window.location.href = '/adminlogin'
           
        }, 500);
        
        dispatch({ type: 'LOADING', payload: false })
       

    } catch (error) {
        console.log(error)
        message.error('Somethig Wrong')
        dispatch({ type: 'LOADING', payload: false })

    }
}