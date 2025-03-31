import axios from 'axios'
import { message } from 'antd'


export const userLogin = (reqObj) => async dispatch => {

    dispatch({ type: 'LOADING', payload: true })

    try {
        const response = await axios.post('/api/users/login', reqObj)
        localStorage.setItem('user', JSON.stringify(response.data))
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

export const userRegister = (reqObj) => async dispatch => {

    dispatch({ type: 'LOADING', payload: true })

    try {
        const response = await axios.post('/api/users/register', reqObj)
        message.success('Registration Successfull !')
        setTimeout(()=>{
            window.location.href = '/login'
           
        }, 500);
        
        dispatch({ type: 'LOADING', payload: false })
       

    } catch (error) {
        console.log(error)
        message.error('Somethig Wrong/Email or Username already exist')
        dispatch({ type: 'LOADING', payload: false })

    }
}

export const getAllUsers =()=>async dispatch=>{

    dispatch({type: 'LOADING', payload: true})

    try {
        const response = await axios.get('/api/users/getallusers')
        dispatch({type: 'GET_ALL_USERS', payload:response.data})
        dispatch({type: 'LOADING', payload:false})

    } catch (error) {
        console.log(error)
        dispatch({type: 'LOADING', payload:false})
        
    }
}

export const addUser = (reqObj) =>async dispatch=>{
    dispatch({type: 'LOADING', payload: true})

    try {
        await axios.post('/api/users/adduser', reqObj)

        dispatch({type: 'LOADING', payload:false})
        message.success('New User Added successfull')
        setTimeout(() =>{
            window.location.href='/adminuser'
        }, 500)

    } catch (error) {
        console.log(error)
        dispatch({type: 'LOADING', payload:false}) 
    }
}

export const editUser = (reqObj) =>async dispatch=>{
    dispatch({type: 'LOADING', payload: true})

    try {
        await axios.post('/api/users/edituser', reqObj)

        dispatch({type: 'LOADING', payload:false})
        message.success('User Edited successfully')
        setTimeout(() =>{
            window.location.href='/adminuser'
        }, 500)

    } catch (error) {
        console.log(error)
        dispatch({type: 'LOADING', payload:false}) 
    }
}


export const deleteUser = (reqObj) =>async dispatch=>{
    dispatch({type: 'LOADING', payload: true})

    try {
        await axios.post('/api/users/deleteuser', reqObj)

        dispatch({type: 'LOADING', payload:false})
        message.success('User deleted successfully')
        setTimeout(() =>{
            window.location.reload()
        }, 500)

    } catch (error) {
        console.log(error)
        dispatch({type: 'LOADING', payload:false}) 
    }
}

export const userFeedback = (values) => async (dispatch) => {
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