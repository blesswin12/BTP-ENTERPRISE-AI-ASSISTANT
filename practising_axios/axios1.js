// import axios from "axios";
// async function getUsers(){
//     const response = await axios.get("https://jsonplaceholder.typicode.com/users");
//     console.log(response.data[0]);
// }

// getUsers([1, 2, 3]);
// async function getUser() {
//     const response = await fetch(
//         "https://jsonplaceholder.typicode.com/users/1"
//     );

//     // Convert JSON string into JavaScript object
//     const data = await response.json();

//     console.log(data);
//     console.log(typeof data);
// }

// getUser();

// import axios from "axios";

// async function getUser() {
//     const response = await axios.get(
//         "https://jsonplaceholder.typicode.com/users/1"
//     );

//     console.log(response.data);
//     console.log(typeof response.data);
//     console.log(response.status);
// }

// getUser();


var FizzBuzz = function () {
    for(i=0;i<=100;i++){
        if(i%3==0 && i%5==0){
            console.log("FizzBuzz");
        }else if(i%3==0){
            console.log("Fizz");
        }else if(i%5==0){
            console.log("Buzz");
        }else{
            console.log(i);
        }
    }
}
console.log(FizzBuzz());