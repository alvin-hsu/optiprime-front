import React, { useEffect, useState} from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableCell,
  TableBody,
  TableHead,
  TableRow,
} from "@aws-amplify/ui-react";

import { fetchAuth } from "./Utils";

const Jobs = () => {
    const [jobs, setJobs] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        fetchAuth("ac_token", "https://api.optipri.me/jobs")
        .then(resp => resp.json())
        .then(result => {
            if (result["Count"] > 0) {
                const items = result["Items"];
                setJobs(items
                    .toSorted((a, b) => (a.submitTime.S < b.submitTime.S ? 1 : -1))
                    .map(x => ({ id: x.jobID.S,
                                 name: x.name.S,
                                 status: x.status.S
                        })
                    )
                );
            }
        })
    }, []);

    // DC TODO: Fix styling to make table rows constant height
    return (
        <Table highlightOnHover={true}>
            <TableHead borderWidth="1px" borderColor="black" height="20px">
                <TableRow height="20px">
                    <TableCell as="th">Job ID</TableCell>
                    <TableCell as="th">Job Name</TableCell>
                    <TableCell as="th">Status</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
            {jobs.map(j =>
                <TableRow height="20px" onClick={() => navigate(`${j.id}`)}>
                    <TableCell>{j.id}</TableCell>
                    <TableCell>{j.name}</TableCell>
                    <TableCell>{j.status}</TableCell>
                </TableRow>
            )}
            </TableBody>
        </Table>
    );
};

export default Jobs;
