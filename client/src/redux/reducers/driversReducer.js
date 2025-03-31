const initialData = {
    drivers:[],
};
export const driversReducer = (state = initialData, action)=>{
    switch(action.type)
    {

        case 'GET_ALL_DRIVERS' : {
            return{
                ...state,
                drivers : action.payload
            }
        }
        default:return state
    }
}