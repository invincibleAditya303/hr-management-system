const express = require('express')
const cors = require('cors')

const app = express()
app.use(express.json())
app.use(cors())

const path = require('path')
const dbPath = path.join(__dirname, 'hrManagementData.db')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { json } = require('stream/consumers')

const PORT = process.env.PORT || 5000

let db = null

const intializeDBAndServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        })

        await db.exec('PRAGMA foreign_keys = ON;')
        app.listen(PORT, () => {
            console.log('Server running at http://localhost:5000')
        })
    } catch (e) {
        console.log(`DB Error: ${e.message}`)
    }
}

intializeDBAndServer()

//Add New Organisation & User API
app.post('/auth/register', async (request, response) => {
    const {orgName, adminName, email, password} = request.body

    const addOrganisationQuery = `
        INSERT INTO organisations
        (name)

        VALUES
        ('${orgName}');
    `
    const organisationDetails = await db.run(addOrganisationQuery)
    
    const organisationId = organisationDetails.lastID
    console.log(organisationId)

    const hashedPassword = await bcrypt.hash(password, 10)

    const adduserDetailsQuery = `
        INSERT INTO users
        (organisation_id, email, password, name)
        VALUES
        (${organisationId}, '${email}', '${hashedPassword}', '${adminName}')
    `

    await db.run(adduserDetailsQuery)
    response.status(200)
    response.send('Added Organisation and Admin details successfully')

})

//Login user API
app.post('/auth/login', async (request, response) => {
    const {email, password, orgName} = request.body

    const getUserQuery = `
        SELECT 
            *
        FROM
            users
        WHERE
            email = '${email}';
    `

    const dbUser = await db.get(getUserQuery)

    if (dbUser === undefined) {
        response.status(401)
        response.json('Invalid user')
    } else {
        const getOrganisationQuery = `
            SELECT
                *
            FROM
                organisations
            WHERE
                name = '${orgName}';
        `

        const organisationDetails = await db.get(getOrganisationQuery)

        if (organisationDetails.id === dbUser.organisation_id) {
            const isPasswordMatched = await bcrypt.compare(password, dbUser.password)

            if (isPasswordMatched) {
                const payload = {
                    userId: dbUser.id,
                    orgId: dbUser.organisation_id, 
                }

                const jwtToken = jwt.sign(payload, 'orgDetails', {expiresIn: '8h'})
                response.status(200)
                response.json(jwtToken)
            }
        } else {
            response.status(401)
            response.json('No user in the organisation')
        }
    }
})

//Authentication Middleware Function
const authenticationToken = (request, response, next) => {
    let jwtToken
    const authHeader = request.headers['authorization']

    if (authHeader !== undefined) {
        jwtToken = authHeader.split(' ')[1]
    }

    if (jwtToken === undefined) {
        response.status(401)
        response.json('Invalid JWT token')
    } else {
        jwt.verify(jwtToken, 'orgDetails', async (error, payload) => {
            if (error) {
                response.status(401)
                response.json('Invalid JWT token')
            } else {
                request.payload = payload
                next()
            }
        })
    }
}

//GET All Employees of an Organisation API
app.get('/employees', authenticationToken, async (request, response) => {
    const payload = request.payload
    const {orgId} = payload

    const getEmployeesQuery = `
        SELECT
            *
        FROM
            employees
        WHERE
            organisation_id = '${orgId}'
        ORDER BY
            id;
    `
    const employeesList = await db.all(getEmployeesQuery)

    response.status(200)
    response.json(employeesList)
})

//GET Employee Details API
app.get('/employees/:id', authenticationToken, async (request, response) => {
    const {id} = request.params

    const getEmployeeDetails = `
        SELECT
            *
        FROM
            employees JOIN
            employee_teams ON employees.id = employee_teams.employee_id
        WHERE
            employees.id = '${id}'
        ORDER BY
            employee_teams.team_id;
    `

    const employeeDetails = await db.get(getEmployeeDetails)

    response.status(200)
    response.json(employeeDetails)
})

//Add Employee to an Organisation API
app.post('/employees', authenticationToken, async (request, response) => {
    const {firstName, lastName, email, phone} = request.body
    const payload = request.payload
    const {orgId} = payload

    const addEmployeeQuery = `
        INSERT INTO employees
            (organisation_id, first_name, last_name, email ,phone)
        VALUES
            ('${orgId}', '${firstName}', '${lastName}', '${email}', '${phone}');
    `

    await db.run(addEmployeeQuery)

    response.status(200)
    response.json('Employee added successfully')
})

//Edit Employee Details of an Organisation
app.put('/employees/:id', authenticationToken, async (request, response) => {
    const {id} = request.params

    const getEmployeeDetails = `
        SELECT
            *
        FROM
            employees
        WHERE
            id = ${id};
    `

    const existingEmployee = await db.get(getEmployeeDetails)

    const {firstName=existingEmployee.first_name, lastName=existingEmployee.last_name, email=existingEmployee.email, phone=existingEmployee.phone} = request.body

    const updateEmployeeQuery = `
        UPDATE
            employees
        SET
            first_name='${firstName}',
            last_name='${lastName}',
            email='${email}',
            phone='${phone}'
        WHERE
            id=${id};
    `

    await db.run(updateEmployeeQuery)

    response.status(200)
    response.json('Updated employee details successfully')
})

//Delete Employee from an Organisation
app.delete('/employees/:id', authenticationToken, async (request, response) => {
    const {id} = request.params

    const removeEmployeeQuery = `
        DELETE FROM
            employees
        WHERE
            id=${id};
    `
    await db.run(removeEmployeeQuery)

    response.status(200)
    response.json('Employee deleted successfully')
})

//