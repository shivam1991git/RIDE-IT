const initialData = {
    cars:[],
};
export const carsReducer = (state = initialData, action)=>{
    switch(action.type)
    {

        case 'GET_ALL_CARS' : {
            return{
                ...state,
                cars : action.payload
            }
        }
        default:return state
    }
}



//  const initialData = {
//   cars:[ { id: 1, brand: 'Toyota', model: 'Camry' },
//   { id: 2, brand: 'Honda', model: 'Civic' },
//   { id: 3, brand: 'Ford', model: 'Fusion' }],
// };
// export const carsReducer = (state = initialData, action)=>{
//   switch(action.type)
//   {

//       case 'GET_ALL_CARS' : {
//           return{
//               ...state,
//               cars : action.payload
//           }
//       }
//       default:return state
//   }
// }