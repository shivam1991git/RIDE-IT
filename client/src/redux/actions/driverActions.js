import axios from 'axios'
import { message } from 'antd'


export const driverLogin = (reqObj) => async dispatch => {

    dispatch({ type: 'LOADING', payload: true })

    try {
        const response = await axios.post('/api/drivers/driverlogin', reqObj)
        localStorage.setItem('driver', JSON.stringify(response.data))
        message.success('Login Successfull !')
        dispatch({ type: 'LOADING', payload: false })
        setTimeout(()=>{
            window.location.href = '/'
           
        }, 500);

    } catch (error) {
        console.log(error)
        message.error('someting wrong')
        dispatch({ type: 'LOADING', payload: false })

    }
}

export const driverRegister = (reqObj) => async dispatch => {

    dispatch({ type: 'LOADING', payload: true })

    try {
        const response = await axios.post('/api/drivers/driverregister', reqObj)
        message.success('Registration Successfull !')
        setTimeout(()=>{
            window.location.href = '/driverlogin'
           
        }, 500);
        
        dispatch({ type: 'LOADING', payload: false })
       

    } catch (error) {
        console.log(error)
        message.error('Somethig Wrong /Email or Username already exist')
        dispatch({ type: 'LOADING', payload: false })

    }
}

export const getAllDrivers =()=>async dispatch=>{

    dispatch({type: 'LOADING', payload: true})

    try {
        const response = await axios.get('/api/drivers/getalldrivers')
        dispatch({type: 'GET_ALL_DRIVERS', payload:response.data})
        dispatch({type: 'LOADING', payload:false})

    } catch (error) {
        console.log(error)
        dispatch({type: 'LOADING', payload:false})
        
    }
}

export const addDriver = (reqObj) =>async dispatch=>{
    dispatch({type: 'LOADING', payload: true})

    try {
        await axios.post('/api/drivers/adddriver', reqObj)

        dispatch({type: 'LOADING', payload:false})
        message.success('New Driver Added successfull')
        setTimeout(() =>{
            window.location.href='/admindriver'
        }, 500)

    } catch (error) {
        console.log(error)
        dispatch({type: 'LOADING', payload:false}) 
    }
}

export const editDriver = (reqObj) =>async dispatch=>{
    dispatch({type: 'LOADING', payload: true})

    try {
        await axios.post('/api/drivers/editdriver', reqObj)

        dispatch({type: 'LOADING', payload:false})
        message.success('Driver Edited successfully')
        setTimeout(() =>{
            window.location.href='/admindriver'
        }, 500)

    } catch (error) {
        console.log(error)
        dispatch({type: 'LOADING', payload:false}) 
    }
}


export const deleteDriver = (reqObj) =>async dispatch=>{
    dispatch({type: 'LOADING', payload: true})

    try {
        await axios.post('/api/drivers/deletedriver', reqObj)

        dispatch({type: 'LOADING', payload:false})
        message.success('Driver deleted successfully')
        setTimeout(() =>{
            window.location.reload()
        }, 500)

    } catch (error) {
        console.log(error)
        dispatch({type: 'LOADING', payload:false}) 
    }
}

export const driverFeedback = (values) => async (dispatch) => {
    dispatch({ type: 'LOADING', payload: true });
    try {
      await axios.post('/api/feedbacks/submit', values);
      message.success('Feedback submitted successfully');
      dispatch({ type: 'LOADING', payload: false });
    } catch (error) {
      console.log(error);
      message.error('Something went wrong');
      dispatch({ type: 'LOADING', payload: false });
    }
  };